import { describe, expect, it } from 'vitest';
import { resolveOfflineSupportWarning } from './offlineSupport';

describe('resolveOfflineSupportWarning', () => {
  it('returns no warning for secure contexts', () => {
    expect(resolveOfflineSupportWarning({
      isSecureContext: true,
      protocol: 'https:',
      hostname: 'jarvis.example.ts.net'
    })).toBeNull();
  });

  it('warns that remote http origins cannot enable offline PWA cache', () => {
    expect(resolveOfflineSupportWarning({
      isSecureContext: false,
      protocol: 'http:',
      hostname: 'dsm918'
    })).toContain('Safari 不会启用离线/PWA 缓存');
  });

  it('falls back to a generic warning for other insecure contexts', () => {
    expect(resolveOfflineSupportWarning({
      isSecureContext: false,
      protocol: 'file:',
      hostname: ''
    })).toContain('不支持离线/PWA 缓存');
  });
});
