/**
 * assetUrl：URL 规范化（保守策略）
 */
import {
  normalizeAssetUrl,
  DEFAULT_CACHE_BUST_PARAM,
  isRemoteHttpUrl,
  appendCacheBustParam,
  removeCacheBustParam,
} from '../../src/core/assetUrl';

describe('normalizeAssetUrl', () => {
  it('trim 空白', () => {
    expect(normalizeAssetUrl('  https://x.com/a.png  ')).toBe('https://x.com/a.png');
  });

  it('协议相对地址补全为 https:', () => {
    expect(normalizeAssetUrl('//cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });

  it('http(s) 原样保留', () => {
    expect(normalizeAssetUrl('https://cdn.example.com/a.png?w=100&sig=abc')).toBe(
      'https://cdn.example.com/a.png?w=100&sig=abc'
    );
    expect(normalizeAssetUrl('http://x.com/a')).toBe('http://x.com/a');
  });

  it('data: / blob: 原样保留', () => {
    expect(normalizeAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('含变量占位符的 URL 不被转义', () => {
    expect(normalizeAssetUrl('https://x.com/{{user.id}}/a.png')).toBe(
      'https://x.com/{{user.id}}/a.png'
    );
  });

  it('空串与非字符串原样返回', () => {
    expect(normalizeAssetUrl('')).toBe('');
    expect(normalizeAssetUrl(undefined)).toBe(undefined);
    expect(normalizeAssetUrl(null)).toBe(null);
  });
});

describe('分片缓存参数（按接入域名，feDomain）', () => {
  it('isRemoteHttpUrl：http(s)/协议相对为真，data:/blob:/变量/相对路径为假', () => {
    expect(isRemoteHttpUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isRemoteHttpUrl('http://cdn.example.com/a.png?x=1')).toBe(true);
    expect(isRemoteHttpUrl('//cdn.example.com/a.png')).toBe(true);
    expect(isRemoteHttpUrl('https://x.com/{{user.id}}/a.png')).toBe(false);
    expect(isRemoteHttpUrl('data:image/png;base64,abc')).toBe(false);
    expect(isRemoteHttpUrl('blob:https://x.com/abc')).toBe(false);
    expect(isRemoteHttpUrl('/relative/a.png')).toBe(false);
    expect(isRemoteHttpUrl(undefined)).toBe(false);
  });

  it('append：默认配置（feDomain=location.hostname）', () => {
    // jsdom 无裸 location 全局，注入后验证默认取值路径（location.hostname）
    const desc = Object.getOwnPropertyDescriptor(global, 'location');
    Object.defineProperty(global, 'location', {
      value: { hostname: 'test-host.example' },
      configurable: true,
    });
    try {
      expect(appendCacheBustParam('https://cdn.example.com/a.png', {})).toBe(
        `https://cdn.example.com/a.png?${DEFAULT_CACHE_BUST_PARAM}=test-host.example`
      );
    } finally {
      if (desc) Object.defineProperty(global, 'location', desc);
      else delete global.location;
    }
  });

  it('append：已有查询串用 & 连接，hash 保留，追加值 encodeURIComponent', () => {
    expect(
      appendCacheBustParam('https://cdn.example.com/a.png?w=100#frag', { getValue: () => 'host-a' })
    ).toBe('https://cdn.example.com/a.png?w=100&feDomain=host-a#frag');
    expect(
      appendCacheBustParam('https://cdn.example.com/a.png?v=1#c', { getValue: () => 'x y' })
    ).toBe('https://cdn.example.com/a.png?v=1&feDomain=x%20y#c');
  });

  it('append：幂等（已存在同参数不重复追加，大小写不敏感）', () => {
    expect(
      appendCacheBustParam('https://cdn.example.com/a.png?FEDomain=host-a', {
        getValue: () => 'host-b',
      })
    ).toBe('https://cdn.example.com/a.png?FEDomain=host-a');
  });

  it('append：非远程/关闭/空值原样返回；自定义参数名生效', () => {
    expect(appendCacheBustParam('data:image/png;base64,abc', { getValue: () => 'x' })).toBe(
      'data:image/png;base64,abc'
    );
    expect(appendCacheBustParam('https://x.com/{{a}}/b.png', { getValue: () => 'x' })).toBe(
      'https://x.com/{{a}}/b.png'
    );
    expect(appendCacheBustParam('https://cdn.example.com/a.png', false)).toBe(
      'https://cdn.example.com/a.png'
    );
    expect(appendCacheBustParam('https://cdn.example.com/a.png', { getValue: () => '' })).toBe(
      'https://cdn.example.com/a.png'
    );
    expect(
      appendCacheBustParam('https://cdn.example.com/a.png', {
        param: 'shard',
        getValue: () => 'h1',
      })
    ).toBe('https://cdn.example.com/a.png?shard=h1');
  });

  it('remove：移除参数并还原 ? 连接符，保留 hash', () => {
    expect(removeCacheBustParam('https://cdn.example.com/a.png?feDomain=h&w=1')).toBe(
      'https://cdn.example.com/a.png?w=1'
    );
    expect(removeCacheBustParam('https://cdn.example.com/a.png?w=1&feDomain=h#f')).toBe(
      'https://cdn.example.com/a.png?w=1#f'
    );
    expect(removeCacheBustParam('https://cdn.example.com/a.png?feDomain=h#f')).toBe(
      'https://cdn.example.com/a.png#f'
    );
  });

  it('remove：大小写不敏感、无关参数不动，append/remove round-trip 恒等且幂等', () => {
    expect(removeCacheBustParam('https://cdn.example.com/a.png?FEDomain=h', 'feDomain')).toBe(
      'https://cdn.example.com/a.png'
    );
    expect(removeCacheBustParam('https://cdn.example.com/a.png?sig=abc')).toBe(
      'https://cdn.example.com/a.png?sig=abc'
    );
    const once = removeCacheBustParam(
      appendCacheBustParam('https://cdn.example.com/a.png', { getValue: () => 'h' })
    );
    expect(once).toBe('https://cdn.example.com/a.png');
    expect(removeCacheBustParam(once)).toBe('https://cdn.example.com/a.png');
  });
});
