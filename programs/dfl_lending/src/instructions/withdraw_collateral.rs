use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{VAULT_AUTHORITY_SEED, WAD};
use crate::errors::ErrorCode;
use crate::events::CollateralWithdrawnEvent;
use crate::math::risk::{health_factor, liquidation_limit, value_from_amount};
use crate::oracle::read_market_prices;
use crate::state::{Market, Position, ProtocolConfig};

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [crate::constants::MARKET_SEED, market.collateral_mint.as_ref(), market.debt_mint.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        constraint = position.market == market.key() @ ErrorCode::InvalidAccount,
        constraint = position.owner == owner.key() @ ErrorCode::Unauthorized
    )]
    pub position: Account<'info, Position>,
    #[account(address = market.collateral_price_feed @ ErrorCode::PriceFeedMismatch)]
    pub collateral_price_feed: UncheckedAccount<'info>,
    #[account(address = market.debt_price_feed @ ErrorCode::PriceFeedMismatch)]
    pub debt_price_feed: UncheckedAccount<'info>,
    #[account(address = market.collateral_mint @ ErrorCode::InvalidAccount)]
    pub collateral_mint: Account<'info, Mint>,
    #[account(address = market.debt_mint @ ErrorCode::InvalidAccount)]
    pub debt_mint: Account<'info, Mint>,
    #[account(
        address = market.liquidity_vault @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.collateral_vault @ ErrorCode::InvalidAccount
    )]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_collateral_account.owner == owner.key() @ ErrorCode::InvalidAccount,
        constraint = user_collateral_account.mint == market.collateral_mint @ ErrorCode::InvalidAccount
    )]
    pub user_collateral_account: Account<'info, TokenAccount>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        ctx.accounts
            .market
            .allows_withdraw(ctx.accounts.protocol_config.paused),
        ErrorCode::ActionNotAllowedForMarketStatus
    );
    require!(
        amount <= ctx.accounts.position.collateral_amount,
        ErrorCode::AmountExceedsCollateral
    );

    let remaining_collateral = ctx
        .accounts
        .position
        .collateral_amount
        .checked_sub(amount)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    if remaining_collateral > 0 {
        require!(
            remaining_collateral >= ctx.accounts.market.min_collateral_amount,
            ErrorCode::CollateralBelowMinimum
        );
    }

    let clock = Clock::get()?;
    let liquidity_before = ctx.accounts.liquidity_vault.amount;

    {
        let market = &mut ctx.accounts.market;
        market.accrue_interest(clock.slot, liquidity_before)?;
    }

    let current_debt = {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        position.sync_debt(market)?
    };

    if current_debt > 0 {
        let (collateral_price, debt_price) = {
            let market = &mut ctx.accounts.market;
            read_market_prices(
                market,
                &ctx.accounts.protocol_config,
                &clock,
                &ctx.accounts.collateral_price_feed,
                &ctx.accounts.debt_price_feed,
            )?
        };

        let remaining_collateral_value = value_from_amount(
            remaining_collateral as u128,
            collateral_price,
            ctx.accounts.collateral_mint.decimals,
        )?;
        let debt_value =
            value_from_amount(current_debt, debt_price, ctx.accounts.debt_mint.decimals)?;
        let liquidation_limit_value = liquidation_limit(
            remaining_collateral_value,
            ctx.accounts.market.liquidation_threshold_bps,
        )?;
        let post_health_factor = health_factor(liquidation_limit_value, debt_value)?;

        require!(post_health_factor >= WAD, ErrorCode::HealthFactorTooLow);
    }

    let signer_seeds: &[&[u8]] = &[
        VAULT_AUTHORITY_SEED,
        ctx.accounts.market.to_account_info().key.as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer_seeds_binding = [signer_seeds];
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.user_collateral_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        &signer_seeds_binding,
    );
    token::transfer(transfer_ctx, amount)?;

    ctx.accounts.position.collateral_amount = remaining_collateral;
    ctx.accounts.market.total_collateral_amount = ctx
        .accounts
        .market
        .total_collateral_amount
        .checked_sub(amount)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    emit!(CollateralWithdrawnEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        amount,
        remaining_collateral_amount: ctx.accounts.position.collateral_amount,
    });

    Ok(())
}
