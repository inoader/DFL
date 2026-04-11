"use client";

import { useState, useCallback } from "react";
import { Transaction, PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { MarketAccount } from "@dfl/sdk";
import {
  openPositionInstruction,
  depositCollateralInstruction,
  borrowInstruction,
  repayInstruction,
  withdrawCollateralInstruction,
  liquidateInstruction,
  findProtocolConfigPda,
  findPositionPda,
  findVaultAuthorityPda,
} from "@dfl/sdk";
import { PROGRAM_ID } from "../lib/constants";
import { parseTokenInput } from "../lib/format";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM,
} from "../lib/solana";
import type { ActionType } from "./position-panel";
import { useLanguage } from "./providers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Props = {
  actionType: ActionType;
  market: MarketAccount;
  collateralDecimals: number;
  debtDecimals: number;
  onClose: () => void;
  onSuccess: () => void;
};

export function ActionModal({
  actionType,
  market,
  collateralDecimals,
  debtDecimals,
  onClose,
  onSuccess,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { copy } = useLanguage();
  const [amount, setAmount] = useState("");
  const [targetOwner, setTargetOwner] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const decimals =
    actionType === "deposit" || actionType === "withdraw"
      ? collateralDecimals
      : debtDecimals;

  const handleSubmit = useCallback(async () => {
    if (!publicKey) {
      setError(copy.actionModal.walletNotConnected);
      return;
    }

    setLoading(true);
    setError(null);
    setTxSig(null);

    try {
      const programId = PROGRAM_ID;
      const marketPk = new PublicKey(market.address);
      const [configPda] = findProtocolConfigPda(programId);
      const [positionPda] = findPositionPda(
        marketPk,
        publicKey,
        programId,
      );
      const [vaultAuthority] = findVaultAuthorityPda(marketPk, programId);
      const collateralMint = new PublicKey(market.collateralMint);
      const debtMint = new PublicKey(market.debtMint);

      let ix;

      switch (actionType) {
        case "open_position": {
          ix = openPositionInstruction({
            programId,
            accounts: {
              owner: publicKey,
              market: marketPk,
              position: positionPda,
              systemProgram: SystemProgram.programId,
            },
          });
          break;
        }
        case "deposit": {
          const parsedAmount = parseTokenInput(amount, decimals, {
            required: copy.actionModal.requiredAmount,
            positive: copy.actionModal.amountPositive,
          });
          const userCollateralAccount = getAssociatedTokenAddress(
            collateralMint,
            publicKey,
          );
          ix = depositCollateralInstruction({
            programId,
            accounts: {
              owner: publicKey,
              market: marketPk,
              position: positionPda,
              userCollateralAccount,
              collateralVault: market.collateralVault,
              tokenProgram: TOKEN_PROGRAM,
            },
            amount: parsedAmount,
          });
          break;
        }
        case "borrow": {
          const parsedAmount = parseTokenInput(amount, decimals, {
            required: copy.actionModal.requiredAmount,
            positive: copy.actionModal.amountPositive,
          });
          const userDebtAccount = getAssociatedTokenAddress(
            debtMint,
            publicKey,
          );
          ix = borrowInstruction({
            programId,
            accounts: {
              owner: publicKey,
              protocolConfig: configPda,
              market: marketPk,
              position: positionPda,
              collateralPriceFeed: market.collateralPriceFeed,
              debtPriceFeed: market.debtPriceFeed,
              collateralMint: market.collateralMint,
              debtMint: market.debtMint,
              liquidityVault: market.liquidityVault,
              userDebtAccount,
              vaultAuthority,
              tokenProgram: TOKEN_PROGRAM,
            },
            amount: parsedAmount,
          });
          break;
        }
        case "repay": {
          const parsedAmount = parseTokenInput(amount, decimals, {
            required: copy.actionModal.requiredAmount,
            positive: copy.actionModal.amountPositive,
          });
          const payerDebtAccount = getAssociatedTokenAddress(
            debtMint,
            publicKey,
          );
          ix = repayInstruction({
            programId,
            accounts: {
              payer: publicKey,
              protocolConfig: configPda,
              market: marketPk,
              position: positionPda,
              payerDebtAccount,
              liquidityVault: market.liquidityVault,
              feeVault: market.feeVault,
              vaultAuthority,
              tokenProgram: TOKEN_PROGRAM,
            },
            amount: parsedAmount,
          });
          break;
        }
        case "withdraw": {
          const parsedAmount = parseTokenInput(amount, decimals, {
            required: copy.actionModal.requiredAmount,
            positive: copy.actionModal.amountPositive,
          });
          const userCollateralAccount = getAssociatedTokenAddress(
            collateralMint,
            publicKey,
          );
          ix = withdrawCollateralInstruction({
            programId,
            accounts: {
              owner: publicKey,
              protocolConfig: configPda,
              market: marketPk,
              position: positionPda,
              collateralPriceFeed: market.collateralPriceFeed,
              debtPriceFeed: market.debtPriceFeed,
              collateralMint: market.collateralMint,
              debtMint: market.debtMint,
              liquidityVault: market.liquidityVault,
              collateralVault: market.collateralVault,
              userCollateralAccount,
              vaultAuthority,
              tokenProgram: TOKEN_PROGRAM,
            },
            amount: parsedAmount,
          });
          break;
        }
        case "liquidate": {
          const parsedAmount = parseTokenInput(amount, decimals, {
            required: copy.actionModal.requiredAmount,
            positive: copy.actionModal.amountPositive,
          });
          const targetPubkey = new PublicKey(targetOwner.trim());
          const [targetPosition] = findPositionPda(
            marketPk,
            targetPubkey,
            programId,
          );
          const liquidatorDebtAccount = getAssociatedTokenAddress(
            debtMint,
            publicKey,
          );
          const liquidatorCollateralAccount = getAssociatedTokenAddress(
            collateralMint,
            publicKey,
          );
          ix = liquidateInstruction({
            programId,
            accounts: {
              liquidator: publicKey,
              protocolConfig: configPda,
              market: marketPk,
              position: targetPosition,
              collateralPriceFeed: market.collateralPriceFeed,
              debtPriceFeed: market.debtPriceFeed,
              collateralMint: market.collateralMint,
              debtMint: market.debtMint,
              liquidatorDebtAccount,
              liquidatorCollateralAccount,
              liquidityVault: market.liquidityVault,
              collateralVault: market.collateralVault,
              vaultAuthority,
              tokenProgram: TOKEN_PROGRAM,
            },
            repayAmount: parsedAmount,
          });
          break;
        }
      }

      const tx = new Transaction().add(ix);
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setTxSig(signature);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : copy.actionModal.txFailed;
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    copy.actionModal.amountPositive,
    copy.actionModal.requiredAmount,
    copy.actionModal.txFailed,
    copy.actionModal.walletNotConnected,
    publicKey,
    actionType,
    amount,
    targetOwner,
    market,
    connection,
    sendTransaction,
    decimals,
    onClose,
    onSuccess,
  ]);

  const needsAmount = actionType !== "open_position";
  const needsTarget = actionType === "liquidate";
  const tokenLabel =
    actionType === "deposit" || actionType === "withdraw"
      ? copy.actionModal.collateralAmount
      : copy.actionModal.debtAmount;

  const actionTitle = copy.actionModal.titles[actionType];
  const actionDescription = copy.actionModal.descriptions[actionType];

  return (
    <Dialog open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{actionTitle}</DialogTitle>
          <DialogDescription>{actionDescription}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}
        {txSig && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300">
            {copy.actionModal.txConfirmed}
            {txSig.slice(0, 20)}...
          </div>
        )}

        {needsTarget && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
              {copy.actionModal.targetOwner}
            </label>
            <Input
              type="text"
              placeholder={copy.actionModal.targetOwnerPlaceholder}
              value={targetOwner}
              onChange={(e) => setTargetOwner(e.target.value)}
            />
          </div>
        )}

        {needsAmount && (
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
              {tokenLabel}
            </label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {copy.actionModal.amountHintPrefix} {decimals}{" "}
              {copy.actionModal.amountHintSuffix}
            </p>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={
            loading ||
            (needsAmount && !amount.trim()) ||
            (needsTarget && !targetOwner.trim())
          }
        >
          {loading ? (
            <>
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {copy.actionModal.processing}
            </>
          ) : (
            `${copy.actionModal.confirmPrefix}${actionTitle}`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
