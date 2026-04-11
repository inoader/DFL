use anchor_lang::prelude::*;

use crate::constants::{BPS_DENOMINATOR, SLOTS_PER_YEAR, WAD};
use crate::errors::ErrorCode;
use crate::math::fixed::{mul_div, mul_div_round_up};

pub fn accrue_simple_interest(
    index: u128,
    rate_per_period_wad: u128,
    periods: u64,
) -> Result<u128> {
    let interest_growth = rate_per_period_wad
        .checked_mul(periods as u128)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    let growth = WAD
        .checked_add(interest_growth)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    mul_div(index, growth, WAD)
}

pub fn apr_bps_to_rate_per_slot_wad(apr_bps: u16) -> Result<u128> {
    let apr_wad = mul_div(apr_bps as u128, WAD, BPS_DENOMINATOR)?;
    mul_div(apr_wad, 1, SLOTS_PER_YEAR as u128)
}

pub fn apply_borrow_index(principal: u128, old_index: u128, new_index: u128) -> Result<u128> {
    if principal == 0 {
        return Ok(0);
    }

    if old_index == 0 {
        return Ok(principal);
    }

    mul_div_round_up(principal, new_index, old_index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accrues_simple_interest_from_index() {
        let one_percent_per_period = WAD / 100;
        assert_eq!(
            accrue_simple_interest(WAD, one_percent_per_period, 2).unwrap(),
            1_020_000_000_000_000_000
        );
    }

    #[test]
    fn accrual_rejects_overflow() {
        assert!(accrue_simple_interest(WAD, u128::MAX, 2).is_err());
    }

    #[test]
    fn borrow_index_application_rounds_up_debt() {
        assert_eq!(apply_borrow_index(1, 3, 4).unwrap(), 2);
    }

    #[test]
    fn apr_to_slot_rate_is_positive_for_normal_apr() {
        assert!(apr_bps_to_rate_per_slot_wad(1_000).unwrap() > 0);
    }
}
