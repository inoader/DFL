use anchor_lang::prelude::*;

use crate::events::MarketStatusChangedEvent;
use crate::state::{Market, MarketStatus, ProtocolConfig};

#[derive(Accounts)]
pub struct SetMarketPause<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<SetMarketPause>, status: MarketStatus) -> Result<()> {
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.authority)?;
    ctx.accounts.market.market_status = status;

    emit!(MarketStatusChangedEvent {
        market: ctx.accounts.market.key(),
        authority: ctx.accounts.authority.key(),
        new_status: status,
    });

    Ok(())
}
