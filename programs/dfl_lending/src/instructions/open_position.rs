use anchor_lang::prelude::*;

use crate::constants::POSITION_SEED;
use crate::events::PositionOpenedEvent;
use crate::state::{Market, Position};

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [crate::constants::MARKET_SEED, market.collateral_mint.as_ref(), market.debt_mint.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = owner,
        space = Position::LEN,
        seeds = [POSITION_SEED, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<OpenPosition>) -> Result<()> {
    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.owner.key();
    position.market = ctx.accounts.market.key();
    position.collateral_amount = 0;
    position.debt_principal = 0;
    position.last_borrow_index = ctx.accounts.market.borrow_index;
    position.bump = ctx.bumps.position;

    emit!(PositionOpenedEvent {
        market: ctx.accounts.market.key(),
        owner: ctx.accounts.owner.key(),
        position: position.key(),
    });

    Ok(())
}
