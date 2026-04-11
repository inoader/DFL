use anchor_lang::prelude::*;

use crate::state::MarketStatus;

#[event]
pub struct ProtocolConfigUpdatedEvent {
    pub admin: Pubkey,
    pub fee_collector: Pubkey,
    pub max_oracle_staleness_seconds: u64,
    pub max_confidence_bps: u16,
}

#[event]
pub struct ProtocolAdminTransferStartedEvent {
    pub current_admin: Pubkey,
    pub pending_admin: Pubkey,
}

#[event]
pub struct ProtocolAdminTransferAcceptedEvent {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct ProtocolPauseChangedEvent {
    pub admin: Pubkey,
    pub paused: bool,
    pub allow_liquidation_when_paused: bool,
}

#[event]
pub struct MarketCreatedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub collateral_mint: Pubkey,
    pub debt_mint: Pubkey,
    pub collateral_vault: Pubkey,
    pub liquidity_vault: Pubkey,
    pub fee_vault: Pubkey,
}

#[event]
pub struct MarketParamsUpdatedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub max_ltv_bps: u16,
    pub liquidation_threshold_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub reserve_factor_bps: u16,
    pub borrow_cap: u64,
    pub market_status: MarketStatus,
}

#[event]
pub struct LiquidationExecutedEvent {
    pub market: Pubkey,
    pub position_owner: Pubkey,
    pub liquidator: Pubkey,
    pub repaid_debt_amount: u64,
    pub seized_collateral_amount: u64,
    pub remaining_debt_amount: u128,
    pub remaining_collateral_amount: u64,
    pub bad_debt_created: bool,
    pub bad_debt_amount: u128,
}

#[event]
pub struct MarketStatusChangedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub new_status: MarketStatus,
}

#[event]
pub struct LiquidityFundedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PositionOpenedEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub position: Pubkey,
}

#[event]
pub struct CollateralDepositedEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub new_collateral_amount: u64,
}

#[event]
pub struct BorrowedEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub new_debt_amount: u128,
}

#[event]
pub struct RepaidEvent {
    pub market: Pubkey,
    pub payer: Pubkey,
    pub position_owner: Pubkey,
    pub amount: u64,
    pub reserve_amount: u128,
    pub remaining_debt_amount: u128,
}

#[event]
pub struct CollateralWithdrawnEvent {
    pub market: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub remaining_collateral_amount: u64,
}

#[event]
pub struct ProtocolFeeCollectedEvent {
    pub market: Pubkey,
    pub authority: Pubkey,
    pub amount: u64,
    pub remaining_reserves: u128,
}
