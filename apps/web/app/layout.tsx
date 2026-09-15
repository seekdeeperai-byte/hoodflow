import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoodFlow — Know What's Moving Before You Buy",
  description:
    "HoodFlow is a crypto intelligence platform. Raw on-chain data is easy to find — HoodFlow helps you read it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <header
            style={{
              borderBottom: "1px solid var(--border)",
              padding: "16px 24px",
              display: "flex",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.01em" }}>HoodFlow</span>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Know what&apos;s moving before you buy.</span>
          </header>
          <main style={{ flex: 1, width: "100%", maxWidth: 880, margin: "0 auto", padding: "28px 20px 60px" }}>
            {children}
          </main>
          <footer style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", color: "var(--text-faint)", fontSize: 12 }}>
            HoodFlow reports on observed on-chain and market data. Nothing here is financial or investment advice.
          </footer>
        </div>
      </body>
    </html>
  );
}
