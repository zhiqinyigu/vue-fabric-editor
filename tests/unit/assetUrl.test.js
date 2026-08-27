/**
 * assetUrl：URL 规范化（保守策略）
 */
import { normalizeAssetUrl } from '../../src/core/assetUrl';

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
    expect(normalizeAssetUrl('https://x.com/{{user.id}}/a.png')).toBe('https://x.com/{{user.id}}/a.png');
  });

  it('空串与非字符串原样返回', () => {
    expect(normalizeAssetUrl('')).toBe('');
    expect(normalizeAssetUrl(undefined)).toBe(undefined);
    expect(normalizeAssetUrl(null)).toBe(null);
  });
});