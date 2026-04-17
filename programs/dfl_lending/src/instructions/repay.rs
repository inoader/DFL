use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::VAULT_AUTHORITY_SEED;
use crate::errors::ErrorCode;
use crate::events::RepaidEvent;
use crate::math::fixed::apply_bps;
use crate::state::{Market, Position, ProtocolConfig};

#[derive(Accounts)]
pub struct Repay<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
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
    #[account(
        mut,
        constraint = payer_debt_account.owner == payer.key() @ ErrorCode::InvalidAccount,
        constraint = payer_debt_account.mint == market.debt_mint @ ErrorCode::InvalidAccount
    )]
    pub payer_debt_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        address = market.liquidity_vault @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        address = market.fee_vault @ ErrorCode::InvalidAccount
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Repay>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        ctx.accounts.market.allows_repay(),
        ErrorCode::ActionNotAllowedForMarketStatus
    );

    let clock = Clock::get()?;
    let liquidity_before = ctx.accounts.liquidity_vault.amount;
    {
        let market = &mut ctx.accounts.market;
        market.accrue_interest(clock.slot, liquidity_before)?;
    }

    let principal_before_sync = ctx.accounts.position.debt_principal;
    let current_debt = {
        let market = &ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        position.sync_debt(market)?
    };
    require!(current_debt > 0, ErrorCode::NoDebt);

    let actual_repay_u128 = (amount as u128).min(current_debt);
    let actual_repay =
        u64::try_from(actual_repay_u128).map_err(|_| error!(ErrorCode::MathOverflow))?;
    let accrued_interest = current_debt.saturating_sub(principal_before_sync);
    let interest_payment = actual_repay_u128.min(accrued_interest);
    let reserve_cut = apply_bps(interest_payment, ctx.accounts.market.reserve_factor_bps)?;

    let repay_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.payer_debt_account.to_account_info(),
            to: ctx.accounts.liquidity_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    token::transfer(repay_ctx, actual_repay)?;

    if reserve_cut > 0 {
        let reserve_cut_u64 =
            u64::try_from(reserve_cut).map_err(|_| error!(ErrorCode::MathOverflow))?;
        let signer_seeds: &[&[u8]] = &[
            VAULT_AUTHORITY_SEED,
            ctx.accounts.market.to_account_info().key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let signer_seeds_binding = [signer_seeds];
        let fee_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                to: ctx.accounts.fee_vault.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &signer_seeds_binding,
        );
        token::transfer(fee_ctx, reserve_cut_u64)?;

        ctx.accounts.market.total_reserves = ctx
            .accounts
            .market
            .total_reserves
            .checked_add(reserve_cut)
            .ok_or(error!(ErrorCode::MathOverflow))?;
    }

    ctx.accounts.market.total_debt_principal = ctx
        .accounts
        .market
        .total_debt_principal
        .checked_sub(actual_repay_u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    ctx.accounts.position.debt_principal = current_debt
        .checked_sub(actual_repay_u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    ctx.accounts.position.last_borrow_index = ctx.accounts.market.borrow_index;

    emit!(RepaidEvent {
        market: ctx.accounts.market.key(),
        payer: ctx.accounts.payer.key(),
        position_owner: ctx.accounts.position.owner,
        amount: actual_repay,
        reserve_amount: reserve_cut,
        remaining_debt_amount: ctx.accounts.position.debt_principal,
    });

    Ok(())
}
