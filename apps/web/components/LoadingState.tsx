import styles from "./ui.module.css";

/**
 * Premium-but-honest loading state: skeleton bars, not a spinner claiming
 * false precision, and no progress percentage the frontend can't actually
 * know. Respects prefers-reduced-motion via the shared shimmer keyframe
 * being gated in globals.css's reduced-motion block (the .animate-in class
 * covers the fade; the shimmer bars below use a CSS animation that is also
 * disabled by the same global `@media (prefers-reduced-motion: reduce)` rule).
 */
export function LoadingState() {
  return (
    <div
      className={styles.card}
      role="status"
      aria-live="polite"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <span className="visually-hidden">Running scan — contacting the HoodFlow intelligence engine…</span>
      {[100, 85, 92, 70, 88].map((width, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            height: 14,
            width: `${width}%`,
            borderRadius: 4,
            background:
              "linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%)",
            backgroundSize: "200% 100%",
            animation: "hf-shimmer 1.4s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`
        @keyframes hf-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
