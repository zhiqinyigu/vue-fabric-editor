/**
 * jsonOptimizer：缺省字段精简（strip）/ 补回（normalize）与真实 fabric 序列化往返一致
 */
import { fabric } from 'fabric';
import '../../src/core/objects/CustomRect';
import '../../src/core/objects/CustomTextbox';
import {
  stripDefaultFields,
  normalizeDefaultFields,
  stripCanvasDefaults,
  normalizeCanvasDefaults,
  appendImagesCacheBustParam,
  removeImagesCacheBustParam,
} from '../../src/core/jsonOptimizer';

// 编辑器 getExtensionKey 会额外序列化的字段（测试中与表对齐用）
const EXTRA_KEYS = [
  'selectable',
  'hasControls',
  'isVariableImage',
  'editable',
  'roundValue',
];

function makeImageElement() {
  const el = document.createElement('img');
  Object.defineProperty(el, 'src', {
    value: 'https://cdn.example.com/a.png',
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, 'width', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
  Object.defineProperty(el, 'crossOrigin', {
    value: 'anonymous',
    writable: true,
    configurable: true,
  });
  return el;
}

describe('jsonOptimizer 缺省字段精简 / 补回', () => {
  it('strip 剔除等于默认值的字段，保留数据字段与自定义键', () => {
    const rect = {
      type: 'rect',
      left: 10,
      top: 20,
      width: 100,
      height: 60,
      angle: 0,
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
      fill: 'rgb(0,0,0)',
      originX: 'left',
      originY: 'top',
      id: 'abc',
    };
    const out = stripDefaultFields({ ...rect });
    expect(out.left).toBe(10);
    expect(out.top).toBe(20);
    expect(out.width).toBe(100);
    expect(out.id).toBe('abc');
    expect('angle' in out).toBe(false);
    expect('opacity' in out).toBe(false);
    expect('scaleX' in out).toBe(false);
    expect('scaleY' in out).toBe(false);
    expect('fill' in out).toBe(false);
    expect('originX' in out).toBe(false);
  });

  it('非默认值不被剔除', () => {
    const rect = {
      type: 'rect',
      left: 0,
      top: 0,
      width: 10,
      height: 10,
      angle: 45,
      opacity: 0.5,
      scaleX: 2,
      fill: '#ff0000',
      originX: 'center',
    };
    const out = stripDefaultFields({ ...rect });
    expect(out.angle).toBe(45);
    expect(out.opacity).toBe(0.5);
    expect(out.scaleX).toBe(2);
    expect(out.fill).toBe('#ff0000');
    expect(out.originX).toBe('center');
  });

  it('空数组默认值（textbox styles / image filters）可剔除并可补回', () => {
    const textbox = {
      type: 'textbox',
      left: 0,
      top: 0,
      width: 20,
      height: 40,
      text: 'x',
      styles: [],
    };
    const stripped = stripDefaultFields({ ...textbox });
    expect('styles' in stripped).toBe(false);
    const normalized = normalizeDefaultFields({ ...stripped });
    expect(normalized.styles).toEqual([]);

    const img = { type: 'image', left: 0, top: 0, width: 10, height: 10, src: 'x', filters: [] };
    const sImg = stripDefaultFields({ ...img });
    expect('filters' in sImg).toBe(false);
    expect('strokeWidth' in sImg).toBe(false); // image 默认 strokeWidth=0
    const nImg = normalizeDefaultFields({ ...sImg });
    expect(nImg.filters).toEqual([]);
    expect(nImg.strokeWidth).toBe(0);
  });

  it('normalize 补回缺省字段，保留已有字段', () => {
    const rect = { type: 'rect', left: 1, top: 2, width: 3, height: 4 };
    const out = normalizeDefaultFields({ ...rect });
    expect(out.left).toBe(1);
    expect(out.width).toBe(3);
    expect(out.angle).toBe(0);
    expect(out.opacity).toBe(1);
    expect(out.originX).toBe('left');
    expect(out.stroke).toBe(null);
    expect(out.selectable).toBe(true);
    expect(out.hasControls).toBe(true);
  });

  it('strip + normalize 是 fabric toObject 的恒等变换（rect）', () => {
    const obj = new fabric.Rect({
      left: 10,
      top: 20,
      width: 100,
      height: 60,
      angle: 30,
      scaleX: 1.5,
    });
    const json = JSON.parse(JSON.stringify(obj.toObject(EXTRA_KEYS)));
    const round = normalizeDefaultFields(stripDefaultFields(JSON.parse(JSON.stringify(json))));
    expect(round).toEqual(json);
  });

  it('strip + normalize 是 fabric toObject 的恒等变换（textbox）', () => {
    const obj = new fabric.Textbox('hello world', {
      left: 5,
      top: 6,
      width: 200,
      height: 60,
      fontWeight: 'bold',
      fill: '#123456',
    });
    const json = JSON.parse(JSON.stringify(obj.toObject(EXTRA_KEYS)));
    const round = normalizeDefaultFields(stripDefaultFields(JSON.parse(JSON.stringify(json))));
    expect(round).toEqual(json);
  });

  it('strip + normalize 是 fabric toObject 的恒等变换（image）', () => {
    const obj = new fabric.Image(makeImageElement(), { left: 1, top: 2 });
    const json = JSON.parse(JSON.stringify(obj.toObject(EXTRA_KEYS)));
    const round = normalizeDefaultFields(stripDefaultFields(JSON.parse(JSON.stringify(json))));
    expect(round).toEqual(json);
  });

  it('strip + normalize 递归处理 group 子对象', () => {
    const group = new fabric.Group([
      new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 }),
      new fabric.Textbox('hi', { left: 20, top: 0, width: 50, height: 20 }),
    ]);
    const json = JSON.parse(JSON.stringify(group.toObject(EXTRA_KEYS)));
    const round = normalizeCanvasDefaults(stripCanvasDefaults(JSON.parse(JSON.stringify(json))));
    expect(round).toEqual(json);
  });
});

describe('jsonOptimizer 分片缓存参数（按接入域名）', () => {
  const cfg = { getValue: () => 'host-a' };

  it('append：image src 与 tile fill.source 均追加，data:/变量跳过，group 递归', () => {
    const json = {
      objects: [
        { type: 'image', src: 'https://cdn.example.com/a.png' },
        { type: 'rect', fill: { type: 'pattern', source: 'https://cdn.example.com/b.png?w=1' } },
        { type: 'image', src: 'https://x.com/{{u.id}}/a.png' },
        { type: 'image', src: 'data:image/png;base64,abc' },
        {
          type: 'group',
          objects: [{ type: 'image', src: 'https://cdn.example.com/c.png#f' }],
        },
      ],
    };
    appendImagesCacheBustParam(json, cfg);
    expect(json.objects[0].src).toBe('https://cdn.example.com/a.png?feDomain=host-a');
    expect(json.objects[1].fill.source).toBe('https://cdn.example.com/b.png?w=1&feDomain=host-a');
    expect(json.objects[2].src).toBe('https://x.com/{{u.id}}/a.png');
    expect(json.objects[3].src).toBe('data:image/png;base64,abc');
    expect(json.objects[4].objects[0].src).toBe('https://cdn.example.com/c.png?feDomain=host-a#f');
  });

  it('remove：与 append 对称，round-trip 恒等', () => {
    const json = {
      objects: [
        { type: 'image', src: 'https://cdn.example.com/a.png?feDomain=host-a&w=1' },
        {
          type: 'rect',
          fill: { type: 'pattern', source: 'https://cdn.example.com/b.png?feDomain=host-a#f' },
        },
      ],
    };
    removeImagesCacheBustParam(json);
    expect(json.objects[0].src).toBe('https://cdn.example.com/a.png?w=1');
    expect(json.objects[1].fill.source).toBe('https://cdn.example.com/b.png#f');
    appendImagesCacheBustParam(json, cfg);
    removeImagesCacheBustParam(json);
    expect(json.objects[0].src).toBe('https://cdn.example.com/a.png?w=1');
    expect(json.objects[1].fill.source).toBe('https://cdn.example.com/b.png#f');
  });
});
