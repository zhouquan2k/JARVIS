const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function resolveOfflineSupportWarning(input: {
  isSecureContext: boolean;
  protocol: string;
  hostname: string;
}): string | null {
  if (input.isSecureContext) {
    return null;
  }

  if (input.protocol === 'http:' && !LOOPBACK_HOSTS.has(input.hostname)) {
    return '当前入口是非 HTTPS 地址，Safari 不会启用离线/PWA 缓存。手机离线使用需要先通过 HTTPS 安全域名访问并完成缓存。';
  }

  return '当前浏览器上下文不支持离线/PWA 缓存。请改用 HTTPS 或 localhost 入口。';
}
