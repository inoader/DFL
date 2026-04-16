use anchor_lang::prelude::*;

use crate::constants::{POSITION_SEED, WAD};
use crate::errors::ErrorCode;
use crate::math::interest::apply_borrow_index;
use crate::state::Market;

#[account]
#[derive(Default)]
pub struct Position {
    pub owner: Pubkey,
    pub market: Pubkey,
    pub collateral_amount: u64,
    pub debt_principal: u128,
    pub last_borrow_index: u128,
    pub bump: u8,
}

impl Position {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 16 + 16 + 1;

    pub fn seeds<'a>(market: &'a Pubkey, owner: &'a Pubkey) -> [&'a [u8]; 3] {
        [POSITION_SEED, market.as_ref(), owner.as_ref()]
    }

    pub fn has_debt(&self) -> bool {
        self.debt_principal > 0
    }

    pub fn current_debt(&self, market: &Market) -> Result<u128> {
        if self.debt_principal == 0 {
            return Ok(0);
        }

        if self.last_borrow_index == 0 {
            return Ok(self.debt_principal);
        }

        apply_borrow_index(
            self.debt_principal,
            self.last_borrow_index.max(WAD),
            market.borrow_index.max(WAD),
        )
    }

    pub fn sync_debt(&mut self, market: &Market) -> Result<u128> {
        let current_debt = self.current_debt(market)?;
        self.debt_principal = current_debt;
        self.last_borrow_index = market.borrow_index.max(WAD);
        Ok(current_debt)
    }

    pub fn assert_owner(&self, signer: &Signer<'_>) -> Result<()> {
        require_keys_eq!(self.owner, signer.key(), ErrorCode::Unauthorized);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn market_with_index(index: u128) -> Market {
        Market {
            borrow_index: index,
            ..Market::default()
        }
    }

    #[test]
    fn current_debt_is_zero_when_principal_is_zero() {
        let position = Position::default();
        let market = market_with_index(WAD);
        assert_eq!(position.current_debt(&market).unwrap(), 0);
    }

    #[test]
    fn current_debt_scales_with_index_growth() {
        let position = Position {
            debt_principal: 100,
            last_borrow_index: WAD,
            ..Position::default()
        };
        let market = market_with_index(WAD + WAD / 10);
        assert_eq!(position.current_debt(&market).unwrap(), 110);
    }

    #[test]
    fn sync_debt_updates_principal_and_anchor_index() {
        let mut position = Position {
            debt_principal: 50,
            last_borrow_index: WAD,
            ..Position::default()
        };
        let market = market_with_index(WAD * 2);
        let current = position.sync_debt(&market).unwrap();

        assert_eq!(current, 100);
        assert_eq!(position.debt_principal, 100);
        assert_eq!(position.last_borrow_index, WAD * 2);
    }

    #[test]
    fn current_debt_treats_zero_old_index_as_identity() {
        let position = Position {
            debt_principal: 77,
            last_borrow_index: 0,
            ..Position::default()
        };
        let market = market_with_index(WAD);
        assert_eq!(position.current_debt(&market).unwrap(), 77);
    }
}
