use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::ErrorCode;
use crate::events::MarketParamsUpdatedEvent;
use crate::state::{Market, MarketStatus, ProtocolConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct UpdateMarketParamsArgs {
    pub oracle_staleness_seconds: u64,
    pub max_confidence_bps: u16,
    pub max_ltv_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub reserve_factor_bps: u16,
    pub min_borrow_amount: u64,
    pub min_collateral_amount: u64,
    pub base_rate_bps: u16,
    pub kink_utilization_bps: u16,
    pub slope_1_bps: u16,
    pub slope_2_bps: u16,
    pub borrow_cap: u64,
    pub debt_price_lower_bound_wad: u128,
    pub debt_price_upper_bound_wad: u128,
    pub market_status: MarketStatus,
}

#[derive(Accounts)]
pub struct UpdateMarketParams<'info> {
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
        address = market.liquidity_vault @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Account<'info, TokenAccount>,
}

pub fn handler(ctx: Context<UpdateMarketParams>, params: UpdateMarketParamsArgs) -> Result<()> {
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.authority)?;
    let clock = Clock::get()?;
    ctx.accounts
        .market
        .accrue_interest(clock.slot, ctx.accounts.liquidity_vault.amount)?;

    require!(
        params.max_ltv_bps < params.liquidation_threshold_bps,
        ErrorCode::InvalidParameter
    );
    require!(
        params.liquidation_threshold_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.liquidation_bonus_bps <= 5_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.close_factor_bps > 0 && params.close_factor_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.reserve_factor_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.max_confidence_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.kink_utilization_bps > 0 && params.kink_utilization_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        (params.debt_price_lower_bound_wad == 0 && params.debt_price_upper_bound_wad == 0)
            || params.debt_price_upper_bound_wad == 0
            || params.debt_price_lower_bound_wad <= params.debt_price_upper_bound_wad,
        ErrorCode::InvalidParameter
    );

    let market = &mut ctx.accounts.market;
    market.oracle_staleness_seconds = params.oracle_staleness_seconds;
    market.max_confidence_bps = params.max_confidence_bps;
    market.max_ltv_bps = params.max_ltv_bps;
    market.liquidation_threshold_bps = params.liquidation_threshold_bps;
    market.liquidation_bonus_bps = params.liquidation_bonus_bps;
    market.close_factor_bps = params.close_factor_bps;
    market.reserve_factor_bps = params.reserve_factor_bps;
    market.min_borrow_amount = params.min_borrow_amount;
    market.min_collateral_amount = params.min_collateral_amount;
    market.base_rate_bps = params.base_rate_bps;
    market.kink_utilization_bps = params.kink_utilization_bps;
    market.slope_1_bps = params.slope_1_bps;
    market.slope_2_bps = params.slope_2_bps;
    market.borrow_cap = params.borrow_cap;
    market.debt_price_lower_bound_wad = params.debt_price_lower_bound_wad;
    market.debt_price_upper_bound_wad = params.debt_price_upper_bound_wad;
    market.market_status = params.market_status;

    emit!(MarketParamsUpdatedEvent {
        market: market.key(),
        authority: ctx.accounts.authority.key(),
        max_ltv_bps: market.max_ltv_bps,
        liquidation_threshold_bps: market.liquidation_threshold_bps,
        liquidation_bonus_bps: market.liquidation_bonus_bps,
        close_factor_bps: market.close_factor_bps,
        reserve_factor_bps: market.reserve_factor_bps,
        borrow_cap: market.borrow_cap,
        market_status: market.market_status,
    });

    Ok(())
}
