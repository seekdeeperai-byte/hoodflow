import type { ContractSecurityData } from "../types/domain.js";
import { Confidence, Direction, Strength, type Signal, SignalType } from "../types/intelligence.js";

/**
 * Turns normalized contract-security data into Signals. Never emits a
 * verdict word ("scam", "safe") — only observations plus the evidence
 * behind them. See docs/SCORING.md for the thresholds used here.
 */
export function analyzeContract(data: ContractSecurityData, now: string = new Date().toISOString()): Signal[] {
  const signals: Signal[] = [];
  const push = (
    signalType: SignalType,
    direction: Direction,
    strength: Strength,
    confidence: Confidence,
    evidence: string,
  ) => {
    signals.push({ signalType, direction, strength, confidence, source: "contract", evidence, timestamp: now });
  };

  if (data.ownerAddress && data.ownerAddress !== "0x0000000000000000000000000000000000000000") {
    const canReclaim = data.canTakeBackOwnership === true || data.hiddenOwner === true;
    push(
      SignalType.OWNERSHIP_RISK,
      canReclaim ? Direction.NEGATIVE : Direction.NEUTRAL,
      canReclaim ? Strength.HIGH : Strength.LOW,
      Confidence.HIGH,
      canReclaim
        ? `Contract ownership is not renounced and the owner can reclaim control (owner: ${data.ownerAddress}).`
        : `Contract ownership is held by ${data.ownerAddress} and has not been renounced.`,
    );
  }

  if (data.isProxy) {
    push(
      SignalType.PROXY_RISK,
      Direction.NEGATIVE,
      Strength.MEDIUM,
      Confidence.HIGH,
      "Contract is a proxy — logic can be changed post-deployment by whoever controls the implementation slot.",
    );
  }

  if (data.isUpgradeable) {
    push(
      SignalType.UPGRADEABILITY_RISK,
      Direction.NEGATIVE,
      Strength.MEDIUM,
      Confidence.MEDIUM,
      "Contract exposes upgradeable behavior.",
    );
  }

  if (data.isBlacklisted !== undefined) {
    push(
      SignalType.BLACKLIST_CAPABILITY,
      data.isBlacklisted ? Direction.NEGATIVE : Direction.NEUTRAL,
      Strength.HIGH,
      Confidence.HIGH,
      data.isBlacklisted
        ? "Contract includes a blacklist function that can block specific addresses from transferring."
        : "No blacklist function detected in the contract.",
    );
  }

  if (data.canBePaused) {
    push(
      SignalType.PAUSE_CAPABILITY,
      Direction.NEGATIVE,
      Strength.HIGH,
      Confidence.HIGH,
      "Contract includes a function that can pause all transfers.",
    );
  }

  if (data.isMintable) {
    push(
      SignalType.MINT_CAPABILITY,
      Direction.NEGATIVE,
      Strength.HIGH,
      Confidence.HIGH,
      "Contract includes a mint function — total supply can be increased after deployment.",
    );
  }

  if (data.isHoneypot) {
    push(
      SignalType.HONEYPOT_RISK,
      Direction.NEGATIVE,
      Strength.HIGH,
      Confidence.HIGH,
      "Simulated sell transactions failed or were blocked, consistent with a honeypot pattern.",
    );
  }

  const buyTax = data.buyTaxPct ?? 0;
  const sellTax = data.sellTaxPct ?? 0;
  if (buyTax >= 10 || sellTax >= 10) {
    push(
      SignalType.FEE_RISK,
      Direction.NEGATIVE,
      buyTax >= 25 || sellTax >= 25 ? Strength.HIGH : Strength.MEDIUM,
      Confidence.HIGH,
      `Transfer taxes are elevated (buy ${buyTax}%, sell ${sellTax}%).`,
    );
  }

  if (data.transferPausable || data.tradingCooldown) {
    push(
      SignalType.TRANSFER_RESTRICTION,
      Direction.NEGATIVE,
      Strength.MEDIUM,
      Confidence.MEDIUM,
      "Contract can restrict or delay transfers (pause and/or cooldown logic present).",
    );
  }

  if (data.maxWalletPct !== undefined && data.maxWalletPct > 0 && data.maxWalletPct < 100) {
    push(
      SignalType.MAX_WALLET_RESTRICTION,
      Direction.NEUTRAL,
      Strength.LOW,
      Confidence.MEDIUM,
      `Max wallet holding is capped at ${data.maxWalletPct}% of supply.`,
    );
  }

  if (data.maxTxPct !== undefined && data.maxTxPct > 0 && data.maxTxPct < 100) {
    push(
      SignalType.MAX_TX_RESTRICTION,
      Direction.NEUTRAL,
      Strength.LOW,
      Confidence.MEDIUM,
      `Max transaction size is capped at ${data.maxTxPct}% of supply.`,
    );
  }

  if (data.top10HolderPct !== undefined) {
    const elevated = data.top10HolderPct >= 50;
    push(
      SignalType.TOP10_CONCENTRATION,
      elevated ? Direction.NEGATIVE : Direction.NEUTRAL,
      data.top10HolderPct >= 70 ? Strength.HIGH : elevated ? Strength.MEDIUM : Strength.LOW,
      Confidence.HIGH,
      `Top 10 holders control ${data.top10HolderPct.toFixed(1)}% of supply.`,
    );
  }

  return signals;
}
