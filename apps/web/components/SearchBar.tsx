"use client";

import { useState, type FormEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import styles from "./ui.module.css";

/**
 * The entry point of the SCAN step. Client-side only — it does not call the
 * API itself, it navigates to the report route, which owns the actual
 * fetch (lib/api.ts's fetchReport). Validates only shape (numeric chain id,
 * 0x-prefixed 40-hex-char address) — the authoritative validation is the
 * backend's own (see apps/api/src/routes/report.ts's ParamsSchema /
 * isValidEvmAddress); this is just to avoid an obviously-wrong request.
 */
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function SearchBar() {
  const router = useRouter();
  const [chainId, setChainId] = useState("");
  const [address, setAddress] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedChainId = chainId.trim();
    const trimmedAddress = address.trim();

    if (!/^\d+$/.test(trimmedChainId)) {
      setValidationError("Chain ID must be a positive number.");
      return;
    }
    if (!ADDRESS_PATTERN.test(trimmedAddress)) {
      setValidationError("Contract address must be a 0x-prefixed 40-character hex address.");
      return;
    }
    setValidationError(null);
    router.push(`/report/${trimmedChainId}/${trimmedAddress}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.card}
      aria-label="Scan a token"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 120px", display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="chainId" className={styles.label}>
            Chain ID
          </label>
          <input
            id="chainId"
            name="chainId"
            inputMode="numeric"
            placeholder="1"
            value={chainId}
            onChange={(e) => setChainId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="address" className={styles.label}>
            Contract address
          </label>
          <input
            id="address"
            name="address"
            className="mono"
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button type="submit" style={buttonStyle}>
            Scan
          </button>
        </div>
      </div>
      {validationError && (
        <p role="alert" style={{ color: "var(--negative)", fontSize: 12, margin: 0 }}>
          {validationError}
        </p>
      )}
    </form>
  );
}

const inputStyle: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  color: "var(--text)",
  padding: "9px 10px",
  fontSize: 13,
};

const buttonStyle: CSSProperties = {
  background: "var(--accent)",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "#0a0b0d",
  fontWeight: 600,
  fontSize: 13,
  padding: "10px 18px",
  cursor: "pointer",
};
