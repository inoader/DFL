use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::ErrorCode;
use crate::events::ProtocolConfigUpdatedEvent;
use crate::state::ProtocolConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct InitializeProtocolParams {
    pub allow_liquidation_when_paused: bool,
    pub max_oracle_staleness_seconds: u64,
    pub max_confidence_bps: u16,
    pub fee_collector: Pubkey,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = ProtocolConfig::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeProtocol>, params: InitializeProtocolParams) -> Result<()> {
    require!(
        params.max_oracle_staleness_seconds > 0,
        ErrorCode::InvalidParameter
    );
    require!(params.max_confidence_bps > 0, ErrorCode::InvalidParameter);
    require!(
        params.max_confidence_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require_keys_neq!(
        params.fee_collector,
        Pubkey::default(),
        ErrorCode::InvalidParameter
    );

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.pending_admin = Pubkey::default();
    config.paused = false;
    config.allow_liquidation_when_paused = params.allow_liquidation_when_paused;
    config.max_oracle_staleness_seconds = params.max_oracle_staleness_seconds;
    config.max_confidence_bps = params.max_confidence_bps;
    config.fee_collector = params.fee_collector;
    config.bump = ctx.bumps.config;

    emit!(ProtocolConfigUpdatedEvent {
        admin: config.admin,
        fee_collector: config.fee_collector,
        max_oracle_staleness_seconds: config.max_oracle_staleness_seconds,
        max_confidence_bps: config.max_confidence_bps,
    });

    Ok(())
}
