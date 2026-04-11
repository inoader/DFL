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
