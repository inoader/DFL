use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::ErrorCode;
use crate::events::LiquidityFundedEvent;
use crate::state::{Market, ProtocolConfig};

#[derive(Accounts)]
pub struct FundLiquidity<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        constraint = funding_source.owner == authority.key() @ ErrorCode::InvalidAccount,
        constraint = funding_source.mint == market.debt_mint @ ErrorCode::InvalidAccount
    )]
    pub funding_source: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.liquidity_vault @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<FundLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.authority)?;

    let clock = Clock::get()?;
    ctx.accounts
        .market
        .accrue_interest(clock.slot, ctx.accounts.liquidity_vault.amount)?;

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.funding_source.to_account_info(),
            to: ctx.accounts.liquidity_vault.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    emit!(LiquidityFundedEvent {
        market: ctx.accounts.market.key(),
        authority: ctx.accounts.authority.key(),
        amount,
    });

    Ok(())
}
