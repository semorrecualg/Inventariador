import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**", "src/assets/**", "src/types/pwa-assets-generator.d.ts", "src/types/workbox.d.ts"] },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  { 
    languageOptions: { globals: globals.browser },
    settings: {
      react: {
        version: "detect"
      }
    }
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReactConfig,
  {
    // Scripts Node (CommonJS) usam require/__dirname/process —
    // bloco no FINAL para não ser sobrescrito pelos configs recomendados
    files: ["**/*.cjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    rules: {
      "no-restricted-globals": [
        "error",
        {
          "name": "screen",
          "message": "Use a local variable or a state variable instead of the global window.screen."
        },
        {
          "name": "name",
          "message": "Use a local variable instead of the global window.name."
        },
        {
          "name": "length",
          "message": "Use a local variable instead of the global window.length."
        }
      ]
    }
  }
];
