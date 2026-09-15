import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Flat config (Next 16 removed `next lint`; `npm run lint` = `eslint .`).
// Scope matches the old `next lint` behaviour: application code only.
export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  {
    extends: [...nextCoreWebVitals, ...nextTypescript],

    rules: {
      "@typescript-eslint/no-explicit-any": "warn",

      // New in eslint-config-next 16 (react-hooks v6). The 6 existing hits are
      // hydration-safe init patterns (read localStorage/media-query after mount,
      // then setState) that predate the upgrade — warn, don't block, until they
      // are refactored to useSyncExternalStore.
      "react-hooks/set-state-in-effect": "warn",

      // A rejected DraftRevision (migration 20260915140000) is retained
      // out-of-chain and must never reach a chain consumer — the version-switch
      // list, restore/Undo, the revision count, or next-number allocation. The
      // filtered chain reads live in src/lib/drafts/revisions.ts; reading
      // DraftRevision directly anywhere else silently reintroduces the leak,
      // so it is a lint error a new consumer has to opt out of in writing
      // rather than a convention it can forget. Writes are unaffected
      // (`rejected` defaults to false) and the draft-delete sweep must stay
      // unfiltered, so only find* is restricted.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression > MemberExpression[property.name=/^find(Many|First|Unique)(OrThrow)?$/][object.property.name='draftRevision']",
          message:
            "Read DraftRevision through listChainRevisions / findChainRevision in src/lib/drafts/revisions.ts — a direct query returns rejected (out-of-chain) rows too.",
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
