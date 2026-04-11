use anchor_lang::prelude::*;

use crate::constants::BPS_DENOMINATOR;
use crate::errors::ErrorCode;

pub fn mul_div(value: u128, numerator: u128, denominator: u128) -> Result<u128> {
    if denominator == 0 {
        return err!(ErrorCode::DivisionByZero);
    }

    value
        .checked_mul(numerator)
        .ok_or(error!(ErrorCode::MathOverflow))?
        .checked_div(denominator)
        .ok_or(error!(ErrorCode::DivisionByZero))
}

pub fn apply_bps(value: u128, bps: u16) -> Result<u128> {
    mul_div(value, bps as u128, BPS_DENOMINATOR)
}

pub fn div_round_up(value: u128, denominator: u128) -> Result<u128> {
    if denominator == 0 {
        return err!(ErrorCode::DivisionByZero);
    }

    let numerator = value
        .checked_add(denominator - 1)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    numerator
        .checked_div(denominator)
        .ok_or(error!(ErrorCode::MathOverflow))
}

pub fn mul_div_round_up(value: u128, numerator: u128, denominator: u128) -> Result<u128> {
    let product = value
        .checked_mul(numerator)
        .ok_or(error!(ErrorCode::MathOverflow))?;
    div_round_up(product, denominator)
}

pub fn checked_pow10(exponent: u32) -> Result<u128> {
    10u128
        .checked_pow(exponent)
        .ok_or(error!(ErrorCode::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mul_div_rejects_zero_denominator() {
        assert!(mul_div(1, 1, 0).is_err());
    }

    #[test]
    fn mul_div_rounds_down() {
        assert_eq!(mul_div(10, 3, 2).unwrap(), 15);
        assert_eq!(mul_div(5, 1, 2).unwrap(), 2);
    }

    #[test]
    fn mul_div_round_up_ceilings_fractional_result() {
        assert_eq!(mul_div_round_up(5, 1, 2).unwrap(), 3);
        assert_eq!(mul_div_round_up(10, 3, 2).unwrap(), 15);
    }
}
