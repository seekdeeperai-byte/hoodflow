import type { HoodflowReport } from "@hoodflow/core";
import { DataModeBadge } from "./DataModeBadge";
import { TokenIdentityCard } from "./TokenIdentityCard";
import { ScoreSummary } from "./ScoreSummary";
import { DataQualityPanel } from "./DataQualityPanel";
import { MarketSnapshotCard } from "./MarketSnapshotCard";
import { ModuleAnalysis } from "./ModuleAnalysis";
import { WhatChanged } from "./WhatChanged";
import { HistoricalIntelligence } from "./HistoricalIntelligence";
import { SocialIntelligence } from "./SocialIntelligence";
import { NewsIntelligence } from "./NewsIntelligence";
import { Attention } from "./Attention";
import { CrossSourceIntelligence } from "./CrossSourceIntelligence";
import { Interpretations } from "./Interpretations";
import { Monitoring } from "./Monitoring";

/**
 * Assembles the full 9-layer information architecture in the spec's own
 * order. Pure presentation: every piece of data displayed already existed
 * on `report` before this component ran — nothing here computes
 * intelligence, it only arranges it.
 */
export function ReportView({ report, mode }: { report: HoodflowReport; mode: "demo" | "live" }) {
  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <DataModeBadge mode={mode} />
      </div>
      <TokenIdentityCard report={report} />
      <ScoreSummary report={report} />
      <DataQualityPanel report={report} />
      <MarketSnapshotCard report={report} />
      <ModuleAnalysis report={report} />
      <WhatChanged report={report} />
      <HistoricalIntelligence report={report} />
      <SocialIntelligence report={report} />
      <NewsIntelligence report={report} />
      <Attention report={report} />
      <CrossSourceIntelligence report={report} />
      <Interpretations report={report} />
      <Monitoring report={report} />
    </div>
  );
}
