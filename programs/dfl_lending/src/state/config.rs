use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::ErrorCode;

#[account]
#[derive(Default)]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub paused: bool,
    pub allow_liquidation_when_paused: bool,
    pub max_oracle_staleness_seconds: u64,
    pub max_confidence_bps: u16,
    pub fee_collector: Pubkey,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 8 + 2 + 32 + 1;

    pub fn seeds() -> [&'static [u8]; 1] {
        [CONFIG_SEED]
    }

    pub fn allows_risk_increase(&self) -> bool {
        !self.paused
    }

    pub fn allows_liquidation(&self) -> bool {
        !self.paused || self.allow_liquidation_when_paused
    }

    pub fn assert_admin(&self, signer: &Signer<'_>) -> Result<()> {
        require_keys_eq!(self.admin, signer.key(), ErrorCode::Unauthorized);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_state_allows_risk_and_liquidation() {
        let config = ProtocolConfig::default();
        assert!(config.allows_risk_increase());
        assert!(config.allows_liquidation());
    }

    #[test]
    fn pause_blocks_risk_increase() {
        let config = ProtocolConfig {
            paused: true,
            ..ProtocolConfig::default()
        };
        assert!(!config.allows_risk_increase());
        assert!(!config.allows_liquidation());
    }

    #[test]
    fn pause_with_liquidation_flag_keeps_liquidations_open() {
        let config = ProtocolConfig {
            paused: true,
            allow_liquidation_when_paused: true,
            ..ProtocolConfig::default()
        };
        assert!(!config.allows_risk_increase());
        assert!(config.allows_liquidation());
    }
}
