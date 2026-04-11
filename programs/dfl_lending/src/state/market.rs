use anchor_lang::prelude::*;

use crate::constants::{BPS_DENOMINATOR, MARKET_SEED, PRICE_FEED_ID_LEN, WAD};
use crate::errors::ErrorCode;
use crate::math::interest::{
    accrue_simple_interest, apply_borrow_index, apr_bps_to_rate_per_slot_wad,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MarketStatus {
    #[default]
    Active,
    ReduceOnly,
    Frozen,
    Settlement,
}

impl MarketStatus {
    pub fn allows_deposit(self) -> bool {
        matches!(self, Self::Active | Self::ReduceOnly)
    }

    pub fn allows_borrow(self) -> bool {
        matches!(self, Self::Active)
    }

    pub fn allows_repay(self) -> bool {
        true
    }

    pub fn allows_withdraw(self) -> bool {
        matches!(self, Self::Active)
    }

    pub fn allows_liquidation(self) -> bool {
        matches!(self, Self::Active | Self::ReduceOnly)
    }
}

#[account]
#[derive(Default)]
pub struct Market {
    pub authority: Pubkey,
    pub collateral_mint: Pubkey,
    pub debt_mint: Pubkey,
    pub collateral_feed_id: [u8; PRICE_FEED_ID_LEN],
    pub debt_feed_id: [u8; PRICE_FEED_ID_LEN],
    pub collateral_price_feed: Pubkey,
    pub debt_price_feed: Pubkey,
    pub collateral_vault: Pubkey,
    pub liquidity_vault: Pubkey,
    pub fee_vault: Pubkey,
    pub total_collateral_amount: u64,
    pub total_debt_principal: u128,
    pub total_reserves: u128,
    pub total_bad_debt: u128,
    pub borrow_index: u128,
    pub last_accrual_slot: u64,
    pub last_valid_price_slot: u64,
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
    pub bump: u8,
}

impl Market {
    pub const LEN: usize = 8
        + 32
        + 32
        + 32
        + 32
        + 32
        + 32
        + 32
        + 32
        + 32
        + 8
        + 16
        + 16
        + 16
        + 16
        + 8
        + 8
        + 8
        + 2
        + 2
        + 2
        + 2
        + 2
        + 2
        + 8
        + 8
        + 2
        + 2
        + 2
        + 2
        + 8
        + 16
        + 16
        + 1
        + 1;

    pub fn seeds<'a>(collateral_mint: &'a Pubkey, debt_mint: &'a Pubkey) -> [&'a [u8]; 3] {
        [MARKET_SEED, collateral_mint.as_ref(), debt_mint.as_ref()]
    }

    pub fn allows_borrow(&self, protocol_paused: bool) -> bool {
        !protocol_paused && self.market_status.allows_borrow()
    }

    pub fn allows_withdraw(&self, protocol_paused: bool) -> bool {
        !protocol_paused && self.market_status.allows_withdraw()
    }

    pub fn allows_deposit(&self) -> bool {
        self.market_status.allows_deposit()
    }

    pub fn allows_repay(&self) -> bool {
        self.market_status.allows_repay()
    }

    pub fn allows_liquidation(&self, protocol_allows_liquidation: bool) -> bool {
        protocol_allows_liquidation && self.market_status.allows_liquidation()
    }

    pub fn effective_oracle_staleness(&self, default_value: u64) -> u64 {
        if self.oracle_staleness_seconds == 0 {
            default_value
        } else {
            self.oracle_staleness_seconds
        }
    }

    pub fn effective_max_confidence_bps(&self, default_value: u16) -> u16 {
        if self.max_confidence_bps == 0 {
            default_value
        } else {
            self.max_confidence_bps
        }
    }

    pub fn utilization_bps(&self, liquidity_vault_balance: u64) -> Result<u16> {
        if self.total_debt_principal == 0 {
            return Ok(0);
        }

        let cash = liquidity_vault_balance as u128 + self.total_reserves;
        let denominator = cash
            .checked_add(self.total_debt_principal)
            .and_then(|value| value.checked_sub(self.total_reserves))
            .ok_or(error!(ErrorCode::MathOverflow))?;

        if denominator == 0 {
            return Ok(0);
        }

        let utilization = self
            .total_debt_principal
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(error!(ErrorCode::MathOverflow))?
            .checked_div(denominator)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        u16::try_from(utilization).map_err(|_| error!(ErrorCode::MathOverflow))
    }

    pub fn current_borrow_rate_bps(&self, liquidity_vault_balance: u64) -> Result<u16> {
        let utilization = self.utilization_bps(liquidity_vault_balance)?;

        let rate = if utilization <= self.kink_utilization_bps {
            let scaled_slope = (self.slope_1_bps as u128)
                .checked_mul(utilization as u128)
                .ok_or(error!(ErrorCode::MathOverflow))?
                .checked_div(self.kink_utilization_bps.max(1) as u128)
                .ok_or(error!(ErrorCode::MathOverflow))?;

            self.base_rate_bps as u128 + scaled_slope
        } else {
            let excess_utilization = utilization
                .checked_sub(self.kink_utilization_bps)
                .ok_or(error!(ErrorCode::MathOverflow))?;
            let denominator = BPS_DENOMINATOR
                .checked_sub(self.kink_utilization_bps as u128)
                .ok_or(error!(ErrorCode::MathOverflow))?
                .max(1);
            let scaled_slope = (self.slope_2_bps as u128)
                .checked_mul(excess_utilization as u128)
                .ok_or(error!(ErrorCode::MathOverflow))?
                .checked_div(denominator)
                .ok_or(error!(ErrorCode::MathOverflow))?;

            self.base_rate_bps as u128 + self.slope_1_bps as u128 + scaled_slope
        };

        u16::try_from(rate).map_err(|_| error!(ErrorCode::MathOverflow))
    }

    pub fn accrue_interest(
        &mut self,
        current_slot: u64,
        liquidity_vault_balance: u64,
    ) -> Result<()> {
        if current_slot <= self.last_accrual_slot {
            return Ok(());
        }

        let delta_slots = current_slot
            .checked_sub(self.last_accrual_slot)
            .ok_or(error!(ErrorCode::MathOverflow))?;

        if delta_slots == 0 || self.total_debt_principal == 0 {
            self.last_accrual_slot = current_slot;
            return Ok(());
        }

        let borrow_rate_bps = self.current_borrow_rate_bps(liquidity_vault_balance)?;
        if borrow_rate_bps == 0 {
            self.last_accrual_slot = current_slot;
            return Ok(());
        }

        let rate_per_slot_wad = apr_bps_to_rate_per_slot_wad(borrow_rate_bps)?;
        let new_borrow_index =
            accrue_simple_interest(self.borrow_index, rate_per_slot_wad, delta_slots)?;
        let new_total_debt = apply_borrow_index(
            self.total_debt_principal,
            self.borrow_index.max(WAD),
            new_borrow_index,
        )?;

        self.borrow_index = new_borrow_index;
        self.total_debt_principal = new_total_debt;
        self.last_accrual_slot = current_slot;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::WAD;

    fn sample_market() -> Market {
        Market {
            total_debt_principal: 50,
            total_reserves: 10,
            borrow_index: WAD,
            last_accrual_slot: 1,
            base_rate_bps: 100,
            kink_utilization_bps: 8_000,
            slope_1_bps: 400,
            slope_2_bps: 2_000,
            ..Market::default()
        }
    }

    #[test]
    fn utilization_uses_available_liquidity_and_debt() {
        let market = sample_market();

        assert_eq!(market.utilization_bps(50).unwrap(), 5_000);
    }

    #[test]
    fn borrow_rate_uses_jump_rate_model() {
        let mut market = sample_market();
        assert_eq!(market.current_borrow_rate_bps(50).unwrap(), 350);

        market.total_debt_principal = 90;
        assert_eq!(market.current_borrow_rate_bps(10).unwrap(), 1_500);
    }

    #[test]
    fn accrue_interest_advances_index_and_slot() {
        let mut market = sample_market();
        market.accrue_interest(10, 50).unwrap();

        assert!(market.borrow_index > WAD);
        assert!(market.total_debt_principal >= 50);
        assert_eq!(market.last_accrual_slot, 10);
    }
}
