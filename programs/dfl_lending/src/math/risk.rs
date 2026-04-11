use anchor_lang::prelude::*;

use crate::constants::WAD;
use crate::math::fixed::{apply_bps, mul_div, mul_div_round_up};

pub fn borrow_limit(collateral_value: u128, max_ltv_bps: u16) -> Result<u128> {
    apply_bps(collateral_value, max_ltv_bps)
}

pub fn liquidation_limit(collateral_value: u128, liquidation_threshold_bps: u16) -> Result<u128> {
    apply_bps(collateral_value, liquidation_threshold_bps)
}

pub fn health_factor(liquidation_limit_value: u128, debt_value: u128) -> Result<u128> {
    if debt_value == 0 {
        return Ok(u128::MAX);
    }

    mul_div(liquidation_limit_value, WAD, debt_value)
}

pub fn value_from_amount(amount_raw: u128, price_wad: u128, token_decimals: u8) -> Result<u128> {
    let scale = 10u128
        .checked_pow(token_decimals as u32)
        .ok_or(error!(crate::errors::ErrorCode::MathOverflow))?;

    mul_div(amount_raw, price_wad, scale)
}

pub fn amount_from_value_round_down(
    value_wad: u128,
    price_wad: u128,
    token_decimals: u8,
) -> Result<u64> {
    let scale = 10u128
        .checked_pow(token_decimals as u32)
        .ok_or(error!(crate::errors::ErrorCode::MathOverflow))?;

    let amount = mul_div(value_wad, scale, price_wad)?;
    u64::try_from(amount).map_err(|_| error!(crate::errors::ErrorCode::MathOverflow))
}

pub fn amount_from_value_round_up(
    value_wad: u128,
    price_wad: u128,
    token_decimals: u8,
) -> Result<u64> {
    let scale = 10u128
        .checked_pow(token_decimals as u32)
        .ok_or(error!(crate::errors::ErrorCode::MathOverflow))?;

    let amount = mul_div_round_up(value_wad, scale, price_wad)?;
    u64::try_from(amount).map_err(|_| error!(crate::errors::ErrorCode::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn computes_collateral_and_liquidation_limits() {
        let collateral_value = 2_000_000_000_000_000_000u128;

        assert_eq!(
            borrow_limit(collateral_value, 7_500).unwrap(),
            1_500_000_000_000_000_000
        );
        assert_eq!(
            liquidation_limit(collateral_value, 8_500).unwrap(),
            1_700_000_000_000_000_000
        );
    }

    #[test]
    fn health_factor_uses_wad_precision() {
        let limit = 1_500_000_000_000_000_000u128;
        let debt = 1_000_000_000_000_000_000u128;

        assert_eq!(
            health_factor(limit, debt).unwrap(),
            1_500_000_000_000_000_000
        );
        assert_eq!(health_factor(limit, 0).unwrap(), u128::MAX);
    }

    #[test]
    fn converts_token_amounts_and_values() {
        let price = 2_000_000_000_000_000_000u128;
        let one_token_6_decimals = 1_000_000u128;

        assert_eq!(
            value_from_amount(one_token_6_decimals, price, 6).unwrap(),
            2_000_000_000_000_000_000
        );
        assert_eq!(
            amount_from_value_round_down(2_000_000_000_000_000_000, price, 6).unwrap(),
            1_000_000
        );
        assert_eq!(amount_from_value_round_up(1, price, 6).unwrap(), 1);
    }
}
