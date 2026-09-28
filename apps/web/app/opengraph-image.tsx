import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "../lib/site";

/**
 * Homepage share image (`og:image`), via Next.js's file-convention image
 * route. This replaces the deliberate absence documented in `layout.tsx`:
 * the reason there was no image was that pointing at a nonexistent asset
 * produces a broken preview, not that a share image was unwanted. Generating
 * one in-repo removes that objection without adding an asset pipeline.
 *
 * Why this is safe to render on every deployment:
 *
 * - **Deterministic.** The only inputs are `SITE_NAME` and `SITE_TAGLINE`,
 *   the same two constants the page's own header, `<title>`, OpenGraph title
 *   and JSON-LD already use (`lib/site.ts`) — so the image cannot drift from
 *   the product copy, and two builds of the same commit produce the same
 *   bytes.
 * - **No data.** No provider call, no database read, no fetch, no
 *   `HoodflowReport`, no token, no metric, no score. Metadata is rendered
 *   before any provider data exists, so any number here would be fabricated
 *   by definition — the same rule `layout.tsx` already applies to the rest of
 *   the metadata. It also makes no performance or accuracy claim.
 * - **No network.** System-font-free by necessity (Satori cannot use the
 *   browser's font stack) but also external-font-free: no `fetch` of a font
 *   file, so the build has no remote dependency and no failure mode tied to
 *   someone else's CDN. `globals.css`'s own comment makes the same choice for
 *   the app itself.
 * - **Built once, not per request.** This is a static file-convention route
 *   with no dynamic segments and no dynamic data, so Next generates it at
 *   build time and Vercel serves it as a static asset. A crawler fetching it
 *   never reaches application code.
 *
 * Next resolves the emitted `og:image` to an absolute URL against
 * `metadataBase` (`layout.tsx`), which is `SITE_URL` — the same origin as the
 * canonical tag, `og:url`, the JSON-LD `@id`s and `sitemap.xml`. There is no
 * second hostname introduced here.
 *
 * Colors are the real design tokens from `app/globals.css` (`--bg`,
 * `--border`, `--text`, `--text-dim`, `--accent`), inlined because Satori
 * resolves no CSS custom properties.
 */
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#0a0b0d",
          padding: "90px 100px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 104,
            fontWeight: 700,
            color: "#e9eaee",
            letterSpacing: "-0.02em",
          }}
        >
          {SITE_NAME}
        </div>

        <div style={{ display: "flex", width: 132, height: 5, backgroundColor: "#5b8cff", margin: "34px 0" }} />

        <div style={{ display: "flex", fontSize: 44, color: "#e9eaee", lineHeight: 1.25 }}>{SITE_TAGLINE}</div>

        <div style={{ display: "flex", marginTop: 26, fontSize: 27, color: "#9a9ca8", lineHeight: 1.4 }}>
          Evidence-driven token intelligence for the Robinhood ecosystem.
        </div>

        {/*
         * The disclaimer the site footer carries, kept on the share card too:
         * a social preview is frequently the only thing a reader sees, so the
         * one line the product refuses to leave off belongs here as well.
         */}
        <div
          style={{
            display: "flex",
            marginTop: 52,
            paddingTop: 26,
            borderTop: "1px solid #24262e",
            fontSize: 22,
            color: "#83858f",
          }}
        >
          Not financial advice. Not a price predictor. Not a buy/sell signal.
        </div>
      </div>
    ),
    size,
  );
}
