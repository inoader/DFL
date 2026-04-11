use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::VAULT_AUTHORITY_SEED;
use crate::errors::ErrorCode;
use crate::events::ProtocolFeeCollectedEvent;
use crate::state::{Market, ProtocolConfig};

#[derive(Accounts)]
pub struct CollectProtocolFee<'info> {
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
        address = market.fee_vault @ ErrorCode::InvalidAccount
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = fee_destination.owner == protocol_config.fee_collector @ ErrorCode::InvalidAccount,
        constraint = fee_destination.mint == market.debt_mint @ ErrorCode::InvalidAccount
    )]
    pub fee_destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CollectProtocolFee>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.authority)?;
    require!(
        ctx.accounts.market.total_reserves >= amount as u128,
        ErrorCode::InvalidAmount
    );

    let signer_seeds: &[&[u8]] = &[
        VAULT_AUTHORITY_SEED,
        ctx.accounts.market.to_account_info().key.as_ref(),
        &[ctx.bumps.vault_authority],
    ];
    let signer_seeds_binding = [signer_seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.fee_destination.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        },
        &signer_seeds_binding,
    );
    token::transfer(cpi_ctx, amount)?;

    ctx.accounts.market.total_reserves = ctx
        .accounts
        .market
        .total_reserves
        .checked_sub(amount as u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    emit!(ProtocolFeeCollectedEvent {
        market: ctx.accounts.market.key(),
        authority: ctx.accounts.authority.key(),
        amount,
        remaining_reserves: ctx.accounts.market.total_reserves,
    });

    Ok(())
}
