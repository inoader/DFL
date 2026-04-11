use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::events::ProtocolConfigUpdatedEvent;
use crate::state::ProtocolConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct UpdateProtocolConfigArgs {
    pub max_oracle_staleness_seconds: u64,
    pub max_confidence_bps: u16,
    pub fee_collector: Pubkey,
}

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handler(ctx: Context<UpdateProtocolConfig>, args: UpdateProtocolConfigArgs) -> Result<()> {
    require!(
        args.max_oracle_staleness_seconds > 0,
        ErrorCode::InvalidParameter
    );
    require!(
        args.max_confidence_bps > 0 && args.max_confidence_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require_keys_neq!(
        args.fee_collector,
        Pubkey::default(),
        ErrorCode::InvalidParameter
    );

    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.admin)?;

    let config = &mut ctx.accounts.protocol_config;
    config.max_oracle_staleness_seconds = args.max_oracle_staleness_seconds;
    config.max_confidence_bps = args.max_confidence_bps;
    config.fee_collector = args.fee_collector;

    emit!(ProtocolConfigUpdatedEvent {
        admin: ctx.accounts.admin.key(),
        fee_collector: config.fee_collector,
        max_oracle_staleness_seconds: config.max_oracle_staleness_seconds,
        max_confidence_bps: config.max_confidence_bps,
    });

    Ok(())
}
