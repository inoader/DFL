use anchor_lang::prelude::*;

use crate::constants::BPS_DENOMINATOR;
use crate::math::fixed::mul_div;

pub fn seize_value_from_repay(repay_value: u128, liquidation_bonus_bps: u16) -> Result<u128> {
    let numerator = BPS_DENOMINATOR + liquidation_bonus_bps as u128;
    mul_div(repay_value, numerator, BPS_DENOMINATOR)
}

pub fn max_liquidatable_debt(current_debt: u128, close_factor_bps: u16) -> Result<u128> {
    mul_div(current_debt, close_factor_bps as u128, BPS_DENOMINATOR)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::WAD;

    #[test]
    fn seize_value_applies_bonus() {
        assert_eq!(seize_value_from_repay(100 * WAD, 500).unwrap(), 105 * WAD);
        assert_eq!(seize_value_from_repay(100 * WAD, 0).unwrap(), 100 * WAD);
    }

    #[test]
    fn max_liquidatable_debt_respects_close_factor() {
        assert_eq!(max_liquidatable_debt(1_000, 5_000).unwrap(), 500);
        assert_eq!(max_liquidatable_debt(1_000, 10_000).unwrap(), 1_000);
        assert_eq!(max_liquidatable_debt(1_000, 0).unwrap(), 0);
    }
}
