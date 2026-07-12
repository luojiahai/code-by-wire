export type Platform = "macos" | "windows";

export function detectPrimaryPlatform(userAgent: string): Platform {
  if (/windows/i.test(userAgent)) return "windows";
  return "macos";
}
