// vite-plugin-pwa's public types import from '@vite-pwa/assets-generator',
// an optional peer dependency this project does not use (no `pwaAssets`
// option in vite.config.ts). Declaring the modules here satisfies the type
// checker without installing the heavy package (sharp/canvas).
// If you adopt the `pwaAssets` feature, install the real package instead.
declare module '@vite-pwa/assets-generator/config' {
  export type BuiltInPreset = any;
  export type Preset = any;
}

declare module '@vite-pwa/assets-generator/api' {
  export type IconAsset<T> = any;
  export type FaviconLink = any;
  export type HtmlLink = any;
  export type AppleSplashScreenLink = any;
  export type HtmlLinkPreset = any;
  export type ImageAssetsInstructions = any;
}
