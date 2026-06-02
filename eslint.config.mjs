import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // Intentional `any` for schema-loose Supabase client typing. Our DB
  // and AI modules accept clients scoped to different schema generics
  // (server vs admin vs schema-scoped), so the SupabaseClient<any,any,any>
  // type alias is the chosen local pattern. See lib/db/blocks.ts header.
  {
    files: [
      "lib/db/**/*.ts",
      "lib/ai/cache.ts",
      "lib/ai/apply-plan.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // react/no-unescaped-entities is a stylistic preference (escape `'`/`"`
  // in JSX text). React core team has effectively deprecated it — modern
  // JSX renderers handle raw characters fine, and the rule produces noise
  // in content-heavy Ukrainian copy.
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },

  // react-hooks/set-state-in-effect (new React 19 compiler rule) flags
  // the standard `useActionState` result-handling pattern:
  //   useEffect(() => { if (state?.ok) { setOpen(false); toast.success(...) } }, [state])
  // and the equally standard "sync local mirror from new server props"
  // pattern (used by TimelineDay for optimistic drag). Both are documented
  // React idioms; the alternative (key-based remount, derived render-time
  // state) would force structural rewrites for no behavioral gain. Disable
  // globally with this note rather than disable per line × 7 files.
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
