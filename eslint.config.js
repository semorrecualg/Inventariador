import pluginJs from "@eslint/js";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "node_modules/**", "public/**", "src/assets/**", "android/**"] },
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

