#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod oracle;
pub mod state;

use instructions::*;
use state::MarketStatus;

declare_id!("CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z");

#[program]
pub mod dfl_lending {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        params: InitializeProtocolParams,
    ) -> Result<()> {
        instructions::initialize_protocol::handler(ctx, params)
    }

    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        args: UpdateProtocolConfigArgs,
    ) -> Result<()> {
        instructions::update_protocol_config::handler(ctx, args)
    }

    pub fn transfer_protocol_admin(
        ctx: Context<TransferProtocolAdmin>,
        args: TransferProtocolAdminArgs,
    ) -> Result<()> {
        instructions::transfer_protocol_admin::handler(ctx, args)
    }

    pub fn accept_protocol_admin(ctx: Context<AcceptProtocolAdmin>) -> Result<()> {
        instructions::accept_protocol_admin::handler(ctx)
    }

    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        instructions::create_market::handler(ctx, params)
    }

    pub fn initialize_market_fee_vault(
        ctx: Context<InitializeMarketFeeVault>,
    ) -> Result<()> {
        instructions::create_market::initialize_market_fee_vault_handler(ctx)
    }

    pub fn fund_liquidity(ctx: Context<FundLiquidity>, amount: u64) -> Result<()> {
        instructions::fund_liquidity::handler(ctx, amount)
    }

    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        instructions::open_position::handler(ctx)
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::deposit_collateral::handler(ctx, amount)
    }

    pub fn borrow(ctx: Context<Borrow>, amount: u64) -> Result<()> {
        instructions::borrow::handler(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>, amount: u64) -> Result<()> {
        instructions::repay::handler(ctx, amount)
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        instructions::withdraw_collateral::handler(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
        instructions::liquidate::handler(ctx, repay_amount)
    }

    pub fn update_market_params(
        ctx: Context<UpdateMarketParams>,
        params: UpdateMarketParamsArgs,
    ) -> Result<()> {
        instructions::update_market_params::handler(ctx, params)
    }

    pub fn set_protocol_pause(
        ctx: Context<SetProtocolPause>,
        args: SetProtocolPauseArgs,
    ) -> Result<()> {
        instructions::set_protocol_pause::handler(ctx, args)
    }

    pub fn set_market_pause(ctx: Context<SetMarketPause>, status: MarketStatus) -> Result<()> {
        instructions::set_market_pause::handler(ctx, status)
    }

    pub fn collect_protocol_fee(ctx: Context<CollectProtocolFee>, amount: u64) -> Result<()> {
        instructions::collect_protocol_fee::handler(ctx, amount)
    }
}
