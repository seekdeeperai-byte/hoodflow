import { z } from "zod";

/**
 * GDELT DOC 2.0 API response shape (mode=artlist, format=json). Docs:
 * https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/ — a public,
 * no-key-required news search API, chosen specifically so this provider
 * needs no product-owner credential decision (unlike a paid news API).
 * Every field is optional: GDELT omits fields it has nothing for, and an
 * article missing `title`/`seendate` is simply dropped during
 * normalization rather than guessed at.
 */
const GdeltArticleSchema = z.object({
  url: z.string().optional(),
  url_mobile: z.string().optional(),
  title: z.string().optional(),
  /** UTC timestamp as YYYYMMDDHHMMSS, e.g. "20260914120000". */
  seendate: z.string().optional(),
  socialimage: z.string().optional(),
  domain: z.string().optional(),
  language: z.string().optional(),
  sourcecountry: z.string().optional(),
});

export const GdeltResponseSchema = z.object({
  articles: z.array(GdeltArticleSchema).optional(),
});

export type GdeltArticle = z.infer<typeof GdeltArticleSchema>;
export type GdeltResponse = z.infer<typeof GdeltResponseSchema>;
