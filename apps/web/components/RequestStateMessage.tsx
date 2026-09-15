import styles from "./ui.module.css";
import { Badge, type BadgeTone } from "./Badge";

export type MessageKind = "invalid_input" | "not_found" | "rate_limited" | "api_error";

const KIND_TITLE: Record<MessageKind, string> = {
  invalid_input: "Invalid token",
  not_found: "Chain not supported",
  rate_limited: "Rate limited",
  api_error: "Intelligence engine unavailable",
};

const KIND_TONE: Record<MessageKind, BadgeTone> = {
  invalid_input: "negative",
  not_found: "neutral",
  rate_limited: "neutral",
  api_error: "unavailable",
};

/**
 * Covers Invalid-token / API-error / partial-connectivity states in one
 * component since they share the same layout — only the copy and tone
 * differ, driven directly by lib/api.ts's ReportRequestState discriminant
 * (mapped 1:1 from the backend's real HTTP status codes, never guessed).
 */
export function RequestStateMessage({ kind, message }: { kind: MessageKind; message: string }) {
  return (
    <div className={styles.card} role="alert">
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{KIND_TITLE[kind]}</h2>
        <Badge tone={KIND_TONE[kind]}>{kind.replace(/_/g, " ")}</Badge>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>{message}</p>
    </div>
  );
}
