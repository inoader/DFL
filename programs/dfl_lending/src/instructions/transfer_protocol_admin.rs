use anchor_lang::prelude::*;

use crate::errors::ErrorCode;
use crate::events::ProtocolAdminTransferStartedEvent;
use crate::state::ProtocolConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct TransferProtocolAdminArgs {
    pub new_admin: Pubkey,
}

#[derive(Accounts)]
pub struct TransferProtocolAdmin<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handler(ctx: Context<TransferProtocolAdmin>, args: TransferProtocolAdminArgs) -> Result<()> {
    require_keys_neq!(
        args.new_admin,
        Pubkey::default(),
        ErrorCode::InvalidParameter
    );
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.admin)?;

    let config = &mut ctx.accounts.protocol_config;
    config.pending_admin = args.new_admin;

    emit!(ProtocolAdminTransferStartedEvent {
        current_admin: ctx.accounts.admin.key(),
        pending_admin: config.pending_admin,
    });

    Ok(())
}
