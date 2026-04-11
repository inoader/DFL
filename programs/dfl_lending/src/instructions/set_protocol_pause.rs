use anchor_lang::prelude::*;

use crate::events::ProtocolPauseChangedEvent;
use crate::state::ProtocolConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct SetProtocolPauseArgs {
    pub paused: bool,
    pub allow_liquidation_when_paused: bool,
}

#[derive(Accounts)]
pub struct SetProtocolPause<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handler(ctx: Context<SetProtocolPause>, args: SetProtocolPauseArgs) -> Result<()> {
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.admin)?;

    let config = &mut ctx.accounts.protocol_config;
    config.paused = args.paused;
    config.allow_liquidation_when_paused = args.allow_liquidation_when_paused;

    emit!(ProtocolPauseChangedEvent {
        admin: ctx.accounts.admin.key(),
        paused: config.paused,
        allow_liquidation_when_paused: config.allow_liquidation_when_paused,
    });

    Ok(())
}
