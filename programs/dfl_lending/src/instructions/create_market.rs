use anchor_lang::prelude::*;
use anchor_spl::associated_token::{get_associated_token_address, AssociatedToken};
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::{FEE_VAULT_SEED, MARKET_SEED, VAULT_AUTHORITY_SEED, WAD};
use crate::errors::ErrorCode;
use crate::events::MarketCreatedEvent;
use crate::state::{Market, MarketStatus, ProtocolConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct CreateMarketParams {
    pub collateral_feed_id: [u8; 32],
    pub debt_feed_id: [u8; 32],
    pub collateral_price_feed: Pubkey,
    pub debt_price_feed: Pubkey,
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
    pub initial_market_status: MarketStatus,
}

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [crate::constants::CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,
    #[account(
        init,
        payer = authority,
        space = Market::LEN,
        seeds = [MARKET_SEED, collateral_mint.key().as_ref(), debt_mint.key().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    pub collateral_mint: Box<Account<'info, Mint>>,
    pub debt_mint: Box<Account<'info, Mint>>,
    #[account(address = params.collateral_price_feed @ ErrorCode::PriceFeedMismatch)]
    pub collateral_price_feed: UncheckedAccount<'info>,
    #[account(address = params.debt_price_feed @ ErrorCode::PriceFeedMismatch)]
    pub debt_price_feed: UncheckedAccount<'info>,
    #[account(
        constraint = collateral_vault.key() == get_associated_token_address(&vault_authority.key(), &collateral_mint.key()) @ ErrorCode::InvalidAccount,
        constraint = collateral_vault.mint == collateral_mint.key() @ ErrorCode::InvalidAccount,
        constraint = collateral_vault.owner == vault_authority.key() @ ErrorCode::InvalidAccount
    )]
    pub collateral_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        constraint = liquidity_vault.key() == get_associated_token_address(&vault_authority.key(), &debt_mint.key()) @ ErrorCode::InvalidAccount,
        constraint = liquidity_vault.mint == debt_mint.key() @ ErrorCode::InvalidAccount,
        constraint = liquidity_vault.owner == vault_authority.key() @ ErrorCode::InvalidAccount
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMarketFeeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.collateral_mint.as_ref(), market.debt_mint.as_ref()],
        bump = market.bump
    )]
    pub market: Box<Account<'info, Market>>,
    /// CHECK: PDA signer authority for token vaults.
    #[account(
        seeds = [VAULT_AUTHORITY_SEED, market.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(address = market.debt_mint @ ErrorCode::InvalidAccount)]
    pub debt_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = authority,
        token::mint = debt_mint,
        token::authority = vault_authority,
        seeds = [FEE_VAULT_SEED, market.key().as_ref()],
        bump
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    ctx.accounts
        .protocol_config
        .assert_admin(&ctx.accounts.authority)?;
    validate_market_params(&params)?;
    require_keys_eq!(
        ctx.accounts.collateral_price_feed.key(),
        params.collateral_price_feed,
        ErrorCode::PriceFeedMismatch
    );
    require_keys_eq!(
        ctx.accounts.debt_price_feed.key(),
        params.debt_price_feed,
        ErrorCode::PriceFeedMismatch
    );
    if !is_empty_feed_id(&params.collateral_feed_id) {
        require!(
            params.collateral_feed_id == ctx.accounts.collateral_price_feed.key().to_bytes(),
            ErrorCode::PriceFeedMismatch
        );
    }
    if !is_empty_feed_id(&params.debt_feed_id) {
        require!(
            params.debt_feed_id == ctx.accounts.debt_price_feed.key().to_bytes(),
            ErrorCode::PriceFeedMismatch
        );
    }

    let market = &mut ctx.accounts.market;
    market.authority = ctx.accounts.authority.key();
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.debt_mint = ctx.accounts.debt_mint.key();
    market.collateral_feed_id = params.collateral_feed_id;
    market.debt_feed_id = params.debt_feed_id;
    market.collateral_price_feed = ctx.accounts.collateral_price_feed.key();
    market.debt_price_feed = ctx.accounts.debt_price_feed.key();
    market.collateral_vault = ctx.accounts.collateral_vault.key();
    market.liquidity_vault = ctx.accounts.liquidity_vault.key();
    let (fee_vault_pda, _) = Pubkey::find_program_address(
        &[FEE_VAULT_SEED, &market.key().to_bytes()],
        &crate::ID,
    );
    market.fee_vault = fee_vault_pda;
    market.total_collateral_amount = 0;
    market.total_debt_principal = 0;
    market.total_reserves = 0;
    market.total_bad_debt = 0;
    market.borrow_index = WAD;
    market.last_accrual_slot = Clock::get()?.slot;
    market.last_valid_price_slot = 0;
    market.oracle_staleness_seconds = params.oracle_staleness_seconds;
    market.max_confidence_bps = params.max_confidence_bps;
    market.max_ltv_bps = params.max_ltv_bps;
    market.liquidation_threshold_bps = params.liquidation_threshold_bps;
    market.liquidation_bonus_bps = params.liquidation_bonus_bps;
    market.close_factor_bps = params.close_factor_bps;
    market.reserve_factor_bps = params.reserve_factor_bps;
    market.min_borrow_amount = params.min_borrow_amount;
    market.min_collateral_amount = params.min_collateral_amount;
    market.base_rate_bps = params.base_rate_bps;
    market.kink_utilization_bps = params.kink_utilization_bps;
    market.slope_1_bps = params.slope_1_bps;
    market.slope_2_bps = params.slope_2_bps;
    market.borrow_cap = params.borrow_cap;
    market.debt_price_lower_bound_wad = params.debt_price_lower_bound_wad;
    market.debt_price_upper_bound_wad = params.debt_price_upper_bound_wad;
    market.market_status = params.initial_market_status;
    market.bump = ctx.bumps.market;

    emit!(MarketCreatedEvent {
        market: market.key(),
        authority: ctx.accounts.authority.key(),
        collateral_mint: market.collateral_mint,
        debt_mint: market.debt_mint,
        collateral_vault: market.collateral_vault,
        liquidity_vault: market.liquidity_vault,
        fee_vault: market.fee_vault,
    });

    Ok(())
}

pub fn initialize_market_fee_vault_handler(
    ctx: Context<InitializeMarketFeeVault>,
) -> Result<()> {
    ctx.accounts
        .protocol_config_required_check(&ctx.accounts.authority)?;
    require_keys_eq!(
        ctx.accounts.fee_vault.key(),
        ctx.accounts.market.fee_vault,
        ErrorCode::InvalidAccount
    );
    Ok(())
}

impl<'info> InitializeMarketFeeVault<'info> {
    fn protocol_config_required_check(&self, _authority: &Signer<'info>) -> Result<()> {
        require_keys_eq!(
            self.market.authority,
            _authority.key(),
            ErrorCode::Unauthorized
        );
        Ok(())
    }
}

fn validate_market_params(params: &CreateMarketParams) -> Result<()> {
    require!(
        params.max_ltv_bps < params.liquidation_threshold_bps,
        ErrorCode::InvalidParameter
    );
    require!(
        params.liquidation_threshold_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.liquidation_bonus_bps <= 5_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.close_factor_bps > 0 && params.close_factor_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.reserve_factor_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.kink_utilization_bps > 0 && params.kink_utilization_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        params.max_confidence_bps <= 10_000,
        ErrorCode::InvalidParameter
    );
    require!(
        (params.debt_price_lower_bound_wad == 0 && params.debt_price_upper_bound_wad == 0)
            || params.debt_price_upper_bound_wad == 0
            || params.debt_price_lower_bound_wad <= params.debt_price_upper_bound_wad,
        ErrorCode::InvalidParameter
    );
    Ok(())
}

fn is_empty_feed_id(feed_id: &[u8; 32]) -> bool {
    feed_id.iter().all(|byte| *byte == 0)
}
