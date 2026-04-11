use anchor_lang::prelude::*;
use pyth_sdk_solana::state::SolanaPriceAccount;

use crate::constants::BPS_DENOMINATOR;
use crate::errors::ErrorCode;
use crate::math::fixed::{checked_pow10, div_round_up, mul_div};
use crate::state::{Market, ProtocolConfig};

#[derive(Clone, Copy, Debug)]
pub struct PriceFeedSnapshot {
    pub price_wad: u128,
    pub confidence_wad: u128,
}

impl PriceFeedSnapshot {
    pub fn conservative_low_price(self) -> Result<u128> {
        self.price_wad
            .checked_sub(self.confidence_wad)
            .ok_or(error!(ErrorCode::InvalidOracle))
    }

    pub fn conservative_high_price(self) -> Result<u128> {
        self.price_wad
            .checked_add(self.confidence_wad)
            .ok_or(error!(ErrorCode::MathOverflow))
    }
}

pub fn read_price_feed(
    price_account: &UncheckedAccount<'_>,
    expected_feed_id: &[u8; 32],
    clock: &Clock,
    maximum_age: u64,
    max_confidence_bps: u16,
) -> Result<PriceFeedSnapshot> {
    let price_feed = SolanaPriceAccount::account_info_to_feed(&price_account.to_account_info())
        .map_err(|_| error!(ErrorCode::InvalidOracle))?;
    if !is_empty_feed_id(expected_feed_id) {
        require!(
            price_feed.id.to_bytes() == *expected_feed_id,
            ErrorCode::PriceFeedMismatch
        );
    }

    let price = price_feed
        .get_price_no_older_than(clock.unix_timestamp, maximum_age)
        .ok_or(error!(ErrorCode::StaleOracle))?;

    let price_abs = u128::try_from(price.price).map_err(|_| error!(ErrorCode::InvalidOracle))?;
    require!(price_abs > 0, ErrorCode::InvalidOracle);
    let confidence_abs = price.conf as u128;
    let confidence_bps = mul_div(confidence_abs, BPS_DENOMINATOR, price_abs)?;

    if confidence_bps > max_confidence_bps as u128 {
        return err!(ErrorCode::OracleConfidenceTooWide);
    }

    let price_wad = scale_to_wad_round_down(price_abs, price.expo)?;
    require!(price_wad > 0, ErrorCode::InvalidOracle);
    let confidence_wad = scale_to_wad_round_up(confidence_abs, price.expo)?;

    Ok(PriceFeedSnapshot {
        price_wad,
        confidence_wad,
    })
}

pub fn read_market_prices(
    market: &mut Market,
    protocol_config: &ProtocolConfig,
    clock: &Clock,
    collateral_price_feed: &UncheckedAccount<'_>,
    debt_price_feed: &UncheckedAccount<'_>,
) -> Result<(u128, u128)> {
    require_keys_eq!(
        collateral_price_feed.key(),
        market.collateral_price_feed,
        ErrorCode::PriceFeedMismatch
    );
    require_keys_eq!(
        debt_price_feed.key(),
        market.debt_price_feed,
        ErrorCode::PriceFeedMismatch
    );

    let max_age = market.effective_oracle_staleness(protocol_config.max_oracle_staleness_seconds);
    let max_confidence_bps =
        market.effective_max_confidence_bps(protocol_config.max_confidence_bps);

    let collateral = read_price_feed(
        collateral_price_feed,
        &market.collateral_feed_id,
        clock,
        max_age,
        max_confidence_bps,
    )?;
    let debt = read_price_feed(
        debt_price_feed,
        &market.debt_feed_id,
        clock,
        max_age,
        max_confidence_bps,
    )?;

    let collateral_price = collateral.conservative_low_price()?;
    let debt_price = debt.conservative_high_price()?;

    if market.debt_price_lower_bound_wad > 0 {
        require!(
            debt.price_wad >= market.debt_price_lower_bound_wad,
            ErrorCode::StablecoinDepeg
        );
    }
    if market.debt_price_upper_bound_wad > 0 {
        require!(
            debt.price_wad <= market.debt_price_upper_bound_wad,
            ErrorCode::StablecoinDepeg
        );
    }

    market.last_valid_price_slot = clock.slot;

    Ok((collateral_price, debt_price))
}

fn is_empty_feed_id(feed_id: &[u8; 32]) -> bool {
    feed_id.iter().all(|byte| *byte == 0)
}

fn scale_to_wad_round_down(value: u128, exponent: i32) -> Result<u128> {
    let total_exponent = 18i32
        .checked_add(exponent)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    if total_exponent >= 0 {
        let factor = checked_pow10(total_exponent as u32)?;
        value
            .checked_mul(factor)
            .ok_or(error!(ErrorCode::MathOverflow))
    } else {
        let divisor = checked_pow10((-total_exponent) as u32)?;
        value
            .checked_div(divisor)
            .ok_or(error!(ErrorCode::DivisionByZero))
    }
}

fn scale_to_wad_round_up(value: u128, exponent: i32) -> Result<u128> {
    let total_exponent = 18i32
        .checked_add(exponent)
        .ok_or(error!(ErrorCode::MathOverflow))?;

    if total_exponent >= 0 {
        let factor = checked_pow10(total_exponent as u32)?;
        value
            .checked_mul(factor)
            .ok_or(error!(ErrorCode::MathOverflow))
    } else {
        let divisor = checked_pow10((-total_exponent) as u32)?;
        div_round_up(value, divisor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scales_common_pyth_exponent_to_wad() {
        assert_eq!(
            scale_to_wad_round_down(123_456_789, -8).unwrap(),
            1_234_567_890_000_000_000
        );
    }

    #[test]
    fn scales_tiny_prices_without_extra_wad_factor() {
        assert_eq!(scale_to_wad_round_down(199, -20).unwrap(), 1);
        assert_eq!(scale_to_wad_round_up(199, -20).unwrap(), 2);
    }

    #[test]
    fn scales_positive_exponents_exactly() {
        assert_eq!(
            scale_to_wad_round_down(2, 3).unwrap(),
            2_000_000_000_000_000_000_000
        );
    }
}
