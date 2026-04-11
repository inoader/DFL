use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Action is not allowed for the current market status")]
    ActionNotAllowedForMarketStatus,
    #[msg("Invalid oracle price")]
    InvalidOracle,
    #[msg("Oracle price is stale")]
    StaleOracle,
    #[msg("Oracle confidence interval is too wide")]
    OracleConfidenceTooWide,
    #[msg("Stablecoin price is outside the allowed range")]
    StablecoinDepeg,
    #[msg("Health factor below required threshold")]
    HealthFactorTooLow,
    #[msg("Invalid market status")]
    InvalidMarketStatus,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid account")]
    InvalidAccount,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Borrow amount is below the market minimum")]
    BorrowBelowMinimum,
    #[msg("Collateral amount is below the market minimum")]
    CollateralBelowMinimum,
    #[msg("Borrow cap exceeded")]
    BorrowCapExceeded,
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    #[msg("Position is not liquidatable")]
    PositionNotLiquidatable,
    #[msg("Position still has outstanding debt")]
    PositionHasDebt,
    #[msg("No debt to repay")]
    NoDebt,
    #[msg("Amount exceeds available collateral")]
    AmountExceedsCollateral,
    #[msg("Amount exceeds allowed liquidation size")]
    AmountExceedsCloseFactor,
    #[msg("Price feed account mismatch")]
    PriceFeedMismatch,
    #[msg("Bad debt has been recorded for the position")]
    BadDebtRecorded,
    #[msg("Instruction not implemented")]
    NotImplemented,
}
