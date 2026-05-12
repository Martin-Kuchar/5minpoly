export const ROUND_DURATION_SECONDS = 300;

export const SUPPORTED_ASSETS = ["btc", "eth", "sol", "xrp"] as const;

export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];

export function isSupportedAsset(value: string): value is SupportedAsset {
  return (SUPPORTED_ASSETS as readonly string[]).includes(value.toLowerCase());
}
