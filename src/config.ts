export const SUNOBOARD_API = 'https://api.sunoboard.com';
export const SUNOAPI_ORG  = 'https://api.sunoapi.org';

export function detectApiBase(apiKey: string, override?: string): string {
  if (override) return override;
  return apiKey.startsWith('sb_') ? SUNOBOARD_API : SUNOAPI_ORG;
}

export function isSunoBoardKey(apiKey: string): boolean {
  return apiKey.startsWith('sb_');
}
