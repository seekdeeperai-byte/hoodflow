"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchReport, type ReportRequestState } from "../../../../lib/api";
import { ReportView } from "../../../../components/ReportView";
import { LoadingState } from "../../../../components/LoadingState";
import { RequestStateMessage, type MessageKind } from "../../../../components/RequestStateMessage";

/**
 * The live report route: fetches through lib/api.ts's server-side proxy
 * (next.config.mjs rewrites) and renders the resulting discriminated-union
 * ReportRequestState — loading / success / one of four real error states —
 * exhaustively. Every branch below maps to an actual backend outcome; there
 * is no unmapped "something went wrong" catch-all beyond api_error, which
 * itself only fires on a real network/parse/5xx failure (see lib/api.ts).
 */
export default function ReportPage() {
  const params = useParams<{ chainId: string; address: string }>();
  const [state, setState] = useState<ReportRequestState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchReport(params.chainId, params.address).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [params.chainId, params.address]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href="/" style={{ fontSize: 12, color: "var(--text-dim)" }}>
        ← New scan
      </Link>

      {state.status === "loading" && <LoadingState />}

      {state.status === "success" && <ReportView report={state.report} mode="live" />}

      {(state.status === "invalid_input" ||
        state.status === "not_found" ||
        state.status === "rate_limited" ||
        state.status === "api_error") && (
        <RequestStateMessage kind={state.status as MessageKind} message={state.message} />
      )}
    </div>
  );
}
