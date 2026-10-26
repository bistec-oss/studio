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
      // Planning artifacts (proposals, operator scripts), not application code.
      // A .cjs here crashed the run: the rules below apply to it, but the
      // react-hooks plugin is only registered for the next configs' file types.
      ".specclaw/**",
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
