use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::events::ProtocolAdminTransferAcceptedEvent;
use crate::state::ProtocolConfig;

#[derive(Accounts)]
pub struct AcceptProtocolAdmin<'info> {
    pub pending_admin: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handler(ctx: Context<AcceptProtocolAdmin>) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    require_keys_eq!(
        config.pending_admin,
        ctx.accounts.pending_admin.key(),
        ErrorCode::Unauthorized
    );

    let previous_admin = config.admin;
    config.admin = ctx.accounts.pending_admin.key();
    config.pending_admin = Pubkey::default();

    emit!(ProtocolAdminTransferAcceptedEvent {
        previous_admin,
        new_admin: config.admin,
    });

    Ok(())
}
