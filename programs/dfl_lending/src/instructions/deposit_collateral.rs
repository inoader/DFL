use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::ErrorCode;
use crate::events::CollateralDepositedEvent;
use crate::state::{Market, Position};

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
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
    #[account(
        mut,
        constraint = user_collateral_account.owner == owner.key() @ ErrorCode::InvalidAccount,
        constraint = user_collateral_account.mint == market.collateral_mint @ ErrorCode::InvalidAccount
    )]
    pub user_collateral_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.collateral_vault @ ErrorCode::InvalidAccount
    )]
    pub collateral_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(
        ctx.accounts.market.allows_deposit(),
        ErrorCode::ActionNotAllowedForMarketStatus
    );

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_collateral_account.to_account_info(),
            to: ctx.accounts.collateral_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    let position = &mut ctx.accounts.position;
    position.collateral_amount = position
        .collateral_amount
        .checked_add(amount)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    require!(
        position.collateral_amount >= ctx.accounts.market.min_collateral_amount,
        ErrorCode::CollateralBelowMinimum
    );

    let market = &mut ctx.accounts.market;
    market.total_collateral_amount = market
        .total_collateral_amount
        .checked_add(amount)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    emit!(CollateralDepositedEvent {
        market: market.key(),
        owner: ctx.accounts.owner.key(),
        amount,
        new_collateral_amount: position.collateral_amount,
    });

    Ok(())
}
