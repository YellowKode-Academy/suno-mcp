import { describe, it, expect } from 'vitest';
import { detectApiBase, isSunoBoardKey, SUNOBOARD_API, SUNOAPI_ORG } from '../config.js';

describe('isSunoBoardKey', () => {
  it('returns true for sb_ prefix', () => {
    expect(isSunoBoardKey('sb_abc123')).toBe(true);
    expect(isSunoBoardKey('sb_')).toBe(true);
  });

  it('returns false for sunoapi.org keys', () => {
    expect(isSunoBoardKey('e57efd1b3c4a2f8d')).toBe(false);
    expect(isSunoBoardKey('sk-abc')).toBe(false);
    expect(isSunoBoardKey('')).toBe(false);
  });
});

describe('detectApiBase', () => {
  it('returns override when provided', () => {
    const custom = 'https://my-custom-api.example.com';
    expect(detectApiBase('sb_key', custom)).toBe(custom);
    expect(detectApiBase('other_key', custom)).toBe(custom);
  });

  it('returns SunoBoard URL for sb_ keys', () => {
    expect(detectApiBase('sb_abc123')).toBe(SUNOBOARD_API);
    expect(detectApiBase('sb_XYZ')).toBe(SUNOBOARD_API);
  });

  it('returns sunoapi.org URL for non-sb_ keys', () => {
    expect(detectApiBase('e57efd1b3c4a')).toBe(SUNOAPI_ORG);
    expect(detectApiBase('any-random-key')).toBe(SUNOAPI_ORG);
  });

  it('constants point to correct production URLs', () => {
    expect(SUNOBOARD_API).toBe('https://api.sunoboard.com');
    expect(SUNOAPI_ORG).toBe('https://api.sunoapi.org');
  });
});
