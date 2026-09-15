import type { ReactNode } from "react";
import styles from "./ui.module.css";

export type BadgeTone = "positive" | "negative" | "neutral" | "accent" | "unavailable" | "default";

const TONE_CLASS: Record<BadgeTone, string> = {
  positive: styles.badgePositive ?? "",
  negative: styles.badgeNegative ?? "",
  neutral: styles.badgeNeutral ?? "",
  accent: styles.badgeAccent ?? "",
  unavailable: styles.badgeUnavailable ?? "",
  default: "",
};

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`${styles.badge} ${TONE_CLASS[tone]}`}>{children}</span>;
}
