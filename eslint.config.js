import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**", "src/assets/**"] },
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
];
