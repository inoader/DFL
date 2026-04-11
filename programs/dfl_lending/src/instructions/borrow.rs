use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::VAULT_AUTHORITY_SEED;
use crate::errors::ErrorCode;
use crate::events::BorrowedEvent;
use crate::math::risk::{borrow_limit, value_from_amount};
use crate::oracle::read_market_prices;
use crate::state::{Market, Position, ProtocolConfig};

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
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
        mut,
        address = market.liquidity_vault @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = user_debt_account.owner == owner.key() @ ErrorCode::InvalidAccount,
        constraint = user_debt_account.mint == market.debt_mint @ ErrorCode::InvalidAccount
    )]
    pub user_debt_account: Account<'info, TokenAccount>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Borrow>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        ctx.accounts.protocol_config.allows_risk_increase(),
        ErrorCode::ProtocolPaused
    );
    require!(
        ctx.accounts
            .market
            .allows_borrow(ctx.accounts.protocol_config.paused),
        ErrorCode::ActionNotAllowedForMarketStatus
    );
    require!(
        amount >= ctx.accounts.market.min_borrow_amount,
        ErrorCode::BorrowBelowMinimum
    );

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

    require!(
        ctx.accounts.liquidity_vault.amount >= amount,
        ErrorCode::InsufficientLiquidity
    );

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

    let collateral_value = value_from_amount(
        ctx.accounts.position.collateral_amount as u128,
        collateral_price,
        ctx.accounts.collateral_mint.decimals,
    )?;
    let new_debt_raw = current_debt
        .checked_add(amount as u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    let new_debt_value =
        value_from_amount(new_debt_raw, debt_price, ctx.accounts.debt_mint.decimals)?;
    let borrow_limit_value = borrow_limit(collateral_value, ctx.accounts.market.max_ltv_bps)?;

    require!(
        new_debt_value <= borrow_limit_value,
        ErrorCode::HealthFactorTooLow
    );

    ctx.accounts.market.total_debt_principal = ctx
        .accounts
        .market
        .total_debt_principal
        .checked_add(amount as u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    if ctx.accounts.market.borrow_cap > 0 {
        require!(
            ctx.accounts.market.total_debt_principal <= ctx.accounts.market.borrow_cap as u128,
            ErrorCode::BorrowCapExceeded
        );
    }

    ctx.accounts.position.debt_principal = new_debt_raw;
    ctx.accounts.position.last_borrow_index = ctx.accounts.market.borrow_index;

    let signer_seeds: &[&[u8]] = &[
        VAULT_AUTHORITY_SEED,
        ctx.accounts.market.to_account_info().key.as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer_seeds_binding = [signer_seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.liquidity_vault.to_account_info(),
            to: ctx.accounts.user_debt_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        &signer_seeds_binding,
    );
    token::transfer(cpi_ctx, amount)?;

    emit!(BorrowedEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        amount,
        new_debt_amount: ctx.accounts.position.debt_principal,
    });

    Ok(())
}
