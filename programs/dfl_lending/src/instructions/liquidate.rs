use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::{BPS_DENOMINATOR, VAULT_AUTHORITY_SEED, WAD};
use crate::errors::ErrorCode;
use crate::events::{LiquidationExecutedEvent, MarketStatusChangedEvent};
use crate::math::fixed::mul_div;
use crate::math::liquidation::{max_liquidatable_debt, seize_value_from_repay};
use crate::math::risk::{
    amount_from_value_round_down, amount_from_value_round_up, health_factor, liquidation_limit,
    value_from_amount,
};
use crate::oracle::read_market_prices;
use crate::state::{Market, MarketStatus, Position, ProtocolConfig};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(
        mut,
        seeds = [crate::constants::MARKET_SEED, market.collateral_mint.as_ref(), market.debt_mint.as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        constraint = position.market == market.key() @ ErrorCode::InvalidAccount
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(address = market.collateral_price_feed @ ErrorCode::PriceFeedMismatch)]
    pub collateral_price_feed: UncheckedAccount<'info>,
    #[account(address = market.debt_price_feed @ ErrorCode::PriceFeedMismatch)]
    pub debt_price_feed: UncheckedAccount<'info>,
    #[account(address = market.collateral_mint @ ErrorCode::InvalidAccount)]
    pub collateral_mint: Box<Account<'info, Mint>>,
    #[account(address = market.debt_mint @ ErrorCode::InvalidAccount)]
    pub debt_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = liquidator_debt_account.owner == liquidator.key() @ ErrorCode::InvalidAccount,
        constraint = liquidator_debt_account.mint == market.debt_mint @ ErrorCode::InvalidAccount
    )]
    pub liquidator_debt_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = liquidator_collateral_account.owner == liquidator.key() @ ErrorCode::InvalidAccount,
        constraint = liquidator_collateral_account.mint == market.collateral_mint @ ErrorCode::InvalidAccount
    )]
    pub liquidator_collateral_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        address = market.liquidity_vault @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        address = market.collateral_vault @ ErrorCode::InvalidAccount
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
    require!(repay_amount > 0, ErrorCode::InvalidAmount);
    require!(
        ctx.accounts
            .market
            .allows_liquidation(ctx.accounts.protocol_config.allows_liquidation()),
        ErrorCode::ActionNotAllowedForMarketStatus
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
    require!(current_debt > 0, ErrorCode::NoDebt);

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
    let debt_value = value_from_amount(current_debt, debt_price, ctx.accounts.debt_mint.decimals)?;
    let liquidation_limit_value = liquidation_limit(
        collateral_value,
        ctx.accounts.market.liquidation_threshold_bps,
    )?;
    let current_health_factor = health_factor(liquidation_limit_value, debt_value)?;
    require!(
        current_health_factor < WAD,
        ErrorCode::PositionNotLiquidatable
    );

    let max_close_amount =
        max_liquidatable_debt(current_debt, ctx.accounts.market.close_factor_bps)?;
    let repay_value_cap_from_collateral = mul_div(
        collateral_value,
        BPS_DENOMINATOR,
        BPS_DENOMINATOR + ctx.accounts.market.liquidation_bonus_bps as u128,
    )?;
    let max_repay_from_collateral = amount_from_value_round_down(
        repay_value_cap_from_collateral,
        debt_price,
        ctx.accounts.debt_mint.decimals,
    )? as u128;

    let actual_repay_u128 = (repay_amount as u128)
        .min(current_debt)
        .min(max_close_amount)
        .min(max_repay_from_collateral);
    require!(actual_repay_u128 > 0, ErrorCode::InvalidAmount);

    let actual_repay =
        u64::try_from(actual_repay_u128).map_err(|_| error!(ErrorCode::MathOverflow))?;
    let actual_repay_value = value_from_amount(
        actual_repay_u128,
        debt_price,
        ctx.accounts.debt_mint.decimals,
    )?;
    let seize_value = seize_value_from_repay(
        actual_repay_value,
        ctx.accounts.market.liquidation_bonus_bps,
    )?;
    let seized_collateral = amount_from_value_round_up(
        seize_value,
        collateral_price,
        ctx.accounts.collateral_mint.decimals,
    )?
    .min(ctx.accounts.position.collateral_amount);
    require!(seized_collateral > 0, ErrorCode::InvalidAmount);

    let repay_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.liquidator_debt_account.to_account_info(),
            to: ctx.accounts.liquidity_vault.to_account_info(),
            authority: ctx.accounts.liquidator.to_account_info(),
        },
    );
    token::transfer(repay_ctx, actual_repay)?;

    let signer_seeds: &[&[u8]] = &[
        VAULT_AUTHORITY_SEED,
        ctx.accounts.market.to_account_info().key.as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer_seeds_binding = [signer_seeds];
    let seize_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.liquidator_collateral_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        &signer_seeds_binding,
    );
    token::transfer(seize_ctx, seized_collateral)?;

    ctx.accounts.position.debt_principal = current_debt
        .checked_sub(actual_repay_u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    ctx.accounts.position.collateral_amount = ctx
        .accounts
        .position
        .collateral_amount
        .checked_sub(seized_collateral)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    ctx.accounts.position.last_borrow_index = ctx.accounts.market.borrow_index;

    ctx.accounts.market.total_debt_principal = ctx
        .accounts
        .market
        .total_debt_principal
        .checked_sub(actual_repay_u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    ctx.accounts.market.total_collateral_amount = ctx
        .accounts
        .market
        .total_collateral_amount
        .checked_sub(seized_collateral)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    let mut bad_debt_amount = 0u128;
    if ctx.accounts.position.collateral_amount == 0 && ctx.accounts.position.debt_principal > 0 {
        bad_debt_amount = ctx.accounts.position.debt_principal;
        ctx.accounts.market.total_bad_debt = ctx
            .accounts
            .market
            .total_bad_debt
            .checked_add(bad_debt_amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        ctx.accounts.market.total_debt_principal = ctx
            .accounts
            .market
            .total_debt_principal
            .checked_sub(bad_debt_amount)
            .ok_or(error!(ErrorCode::MathOverflow))?;
        ctx.accounts.position.debt_principal = 0;

        if matches!(ctx.accounts.market.market_status, MarketStatus::Active) {
            ctx.accounts.market.market_status = MarketStatus::ReduceOnly;
            emit!(MarketStatusChangedEvent {
                market: ctx.accounts.market.key(),
                authority: ctx.accounts.protocol_config.admin,
                new_status: ctx.accounts.market.market_status,
            });
        }
    }

    emit!(LiquidationExecutedEvent {
        market: ctx.accounts.market.key(),
        position_owner: ctx.accounts.position.owner,
        liquidator: ctx.accounts.liquidator.key(),
        repaid_debt_amount: actual_repay,
        seized_collateral_amount: seized_collateral,
        remaining_debt_amount: ctx.accounts.position.debt_principal,
        remaining_collateral_amount: ctx.accounts.position.collateral_amount,
        bad_debt_created: bad_debt_amount > 0,
        bad_debt_amount,
    });

    Ok(())
}
