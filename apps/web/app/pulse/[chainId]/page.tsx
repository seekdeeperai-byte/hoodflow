"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { PulseWindow } from "@hoodflow/core";
import { fetchPulse, type PulseRequestState } from "../../../lib/api";
import { EcosystemPulseView } from "../../../components/EcosystemPulse";
import { LoadingState } from "../../../components/LoadingState";
import { RequestStateMessage, type MessageKind } from "../../../components/RequestStateMessage";

/**
 * Robinhood Ecosystem Pulse page (FINAL GAP CLOSURE phase §6) — chain-level,
 * additive to the token-level `/report/:chainId/:address` route. Fetches
 * through lib/api.ts's fetchPulse (same server-side rewrite proxy pattern as
 * the report page) and re-fetches whenever the selectable time window
 * changes, since the window is a real query parameter the backend uses to
 * scope its own aggregation — never a frontend-only filter over one fixed
 * payload.
 */
export default function PulsePage() {
  const params = useParams<{ chainId: string }>();
  const [window, setWindow] = useState<PulseWindow>("24h");
  const [state, setState] = useState<PulseRequestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchPulse(params.chainId, window).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [params.chainId, window]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href="/" style={{ fontSize: 12, color: "var(--text-dim)" }}>
        &larr; Back
      </Link>

      {state.status === "loading" && <LoadingState />}

      {state.status === "success" && (
        <EcosystemPulseView pulse={state.pulse} window={window} onWindowChange={setWindow} />
      )}

      {(state.status === "invalid_input" ||
        state.status === "not_found" ||
        state.status === "rate_limited" ||
        state.status === "api_error") && (
        <RequestStateMessage kind={state.status as MessageKind} message={state.message} />
      )}
    </div>
  );
}
