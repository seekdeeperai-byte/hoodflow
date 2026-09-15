import styles from "./ui.module.css";

/**
 * The one, consistent way this app shows "we don't know" — never a zero,
 * never a blank, never a hidden field. `reason` should be the backend's own
 * explanation (a DataState, a limitation string, or a MetricDelta.note) so
 * the UI never invents its own justification for missing data.
 */
export function DataUnavailable({ reason }: { reason: string }) {
  return (
    <div className={styles.unavailablePanel} role="note">
      <strong style={{ color: "var(--unavailable)" }}>DATA UNAVAILABLE.</strong> {reason}
    </div>
  );
}
