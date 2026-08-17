import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // The engine boundary (PLAN.md decision 28). `lib/diagnose/` is a
  // dependency-free, framework-free package: it may import `zod` and its own
  // relative modules, nothing else. A diagnostic engine that cannot reach a
  // network client or a clock cannot emit a finding that isn't a consequence of
  // its arguments.
  //
  // Test files are exempt here because `purity.test.ts` reads the engine's
  // source off disk to enforce the same rule with no allowlist at all — that
  // test, not this rule, is the real boundary.
  {
    files: ["lib/diagnose/**/*.ts"],
    ignores: ["lib/diagnose/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "next/**",
                "react",
                "react-*",
                "react/**",
                "react-dom/**",
                "@google/genai",
                "@google/**",
                "@/*",
                "@/**",
                "node:*",
                "fs",
                "path",
              ],
              message:
                "lib/diagnose is dependency-free: only `zod` and relative imports are allowed. Move this code to lib/triage, the data layer, or the route handler.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
