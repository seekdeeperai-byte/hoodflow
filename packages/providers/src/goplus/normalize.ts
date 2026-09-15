import type { ContractSecurityData } from "@hoodflow/core";
import type { GoPlusTokenResult } from "./schema.js";

function bool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === "1";
}

/**
 * GoPlus sends buy_tax/sell_tax as an EMPTY STRING (not "0", not absent)
 * for tokens where no tax logic was detected — confirmed against a live
 * response for Robinhood Chain's USDG token (2026-09-14, see
 * docs/LIVE_VERIFICATION.md). `Number("")` is `0` in JS, so this already
 * resolves to 0%, which is the correct reading — but treat that as
 * intentional, not an accident of `Number()` coercion, since a genuinely
 * absent field (`undefined`) must stay `undefined`, not become 0.
 */
function pctFraction(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  if (v === "") return 0;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return n * 100;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

export function normalizeGoPlus(result: GoPlusTokenResult): ContractSecurityData {
  const holders = [...(result.holders ?? [])].sort((a, b) => Number(b.percent ?? 0) - Number(a.percent ?? 0));
  const top10Pct = holders.length
    ? holders.slice(0, 10).reduce((sum, h) => sum + (Number(h.percent ?? 0) || 0), 0) * 100
    : undefined;

  return {
    // Contextual identity evidence only (Phase 5) — never authoritative on its own.
    // See @hoodflow/core types/identity.ts.
    observedName: result.token_name,
    observedSymbol: result.token_symbol,
    isOpenSource: bool(result.is_open_source),
    isProxy: bool(result.is_proxy),
    isUpgradeable: bool(result.is_proxy), // GoPlus doesn't separately flag upgradeability; proxy implies it.
    ownerAddress: result.owner_address ?? null,
    canTakeBackOwnership: bool(result.can_take_back_ownership),
    hiddenOwner: bool(result.hidden_owner),
    isMintable: bool(result.is_mintable),
    isHoneypot: bool(result.is_honeypot),
    isBlacklisted: bool(result.is_blacklisted),
    isWhitelisted: bool(result.is_whitelisted),
    isAntiWhale: bool(result.is_anti_whale),
    canBePaused: bool(result.transfer_pausable),
    transferPausable: bool(result.transfer_pausable),
    tradingCooldown: bool(result.trading_cooldown),
    buyTaxPct: pctFraction(result.buy_tax),
    sellTaxPct: pctFraction(result.sell_tax),
    holderCount: num(result.holder_count),
    top10HolderPct: top10Pct,
    lpHolderCount: num(result.lp_holder_count),
    creatorAddress: result.creator_address ?? null,
    creatorBalancePct: pctFraction(result.creator_percent),
  };
}
