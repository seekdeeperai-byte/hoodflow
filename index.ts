// Vercel Function entry point. Intentionally one line: all of the adapter
// logic lives in src/vercel-handler.ts, which is type-checked and compiled by
// apps/api/tsconfig.json. See that file's header comment.
export { default } from "../dist/vercel-handler.js";
