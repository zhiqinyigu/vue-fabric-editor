/**
 * parsePosterJson 粘贴入口清洗单测
 *
 * 背景：粘贴是「任意外部 JSON 直接入库」的通道，绕过编辑器 getJson 的对称清理；
 * 内容若带请求态分片参数 feDomain（来源域名固化），会原样落库导致各接入域名跨域失败。
 * 回归重点：入库前静默清洗为存储态干净 URL（不弹任何提示）。
 */
// 本测试只验证 parsePosterJson 纯函数：mock 掉 composition-api（其 import 会拉起
// Vue 运行时，devtools 日志在测试结束后打印，导致 jest 退出码为 1）与 variableEngine
jest.mock('@vue/composition-api', () => ({
  computed: (fn) => fn,
  ref: (v) => ({ value: v }),
  watch: () => {},
  onMounted: () => {},
  onBeforeUnmount: () => {},
  onUnmounted: () => {},
  nextTick: (fn) => fn && fn(),
}));
jest.mock('@/core/variableEngine', () => ({
  extractVariables: () => [],
}));
import { parsePosterJson } from '@/examples/poster-entry/usePosterEntry';

const field = { title: '海报' };

function posterJson(srcs) {
  return {
    objects: srcs.map((src) => ({ type: 'image', src })),
    // findWorkspace 找不到 workspace 时 only 影响 expectedSize 校验，这里不传期望尺寸
  };
}

describe('parsePosterJson：请求态分片参数清洗（feDomain，静默）', () => {
  it('图片 src 与背景 pattern source 携带 feDomain 时静默移除', () => {
    const json = posterJson([
      'https://cdn.example.com/a.png?w=1&feDomain=host-a#frag',
      'https://cdn.example.com/b.png',
    ]);
    json.objects.push({
      type: 'image',
      fill: { type: 'pattern', source: 'https://cdn.example.com/bg.png?feDomain=host-b' },
    });
    const res = parsePosterJson(JSON.stringify(json), field);
    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();
    expect(res.json.objects[0].src).toBe('https://cdn.example.com/a.png?w=1#frag');
    expect(res.json.objects[1].src).toBe('https://cdn.example.com/b.png');
    expect(res.json.objects[2].fill.source).toBe('https://cdn.example.com/bg.png');
  });

  it('干净数据原样返回', () => {
    const json = posterJson(['https://cdn.example.com/a.png?w=1']);
    const res = parsePosterJson(JSON.stringify(json), field);
    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();
    expect(res.json.objects[0].src).toBe('https://cdn.example.com/a.png?w=1');
  });

  it('data: / 变量占位符 URL 不参与清洗', () => {
    const json = posterJson(['data:image/png;base64,xxx', 'https://cdn.example.com/{{img}}']);
    const res = parsePosterJson(JSON.stringify(json), field);
    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();
    expect(res.json.objects[0].src).toBe('data:image/png;base64,xxx');
    expect(res.json.objects[1].src).toBe('https://cdn.example.com/{{img}}');
  });

  it('清洗作用于 transform 转换后的最终数据', () => {
    const json = posterJson(['https://cdn.example.com/a.png?feDomain=host-a']);
    const res = parsePosterJson(JSON.stringify(json), field, (obj) => {
      obj.objects.unshift({
        type: 'image',
        src: 'https://cdn.example.com/late.png?feDomain=host-late',
      });
      return obj;
    });
    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();
    expect(res.json.objects[0].src).toBe('https://cdn.example.com/late.png');
    expect(res.json.objects[1].src).toBe('https://cdn.example.com/a.png');
  });
});
