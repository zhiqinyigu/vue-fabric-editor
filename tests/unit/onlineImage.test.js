/**
 * 在线图片：导出仅保留 URL（非 base64）、JSON 恢复按 crossOrigin 重建
 */
import { fabric } from 'fabric';
import AddBaseTypePlugin from '../../src/core/plugin/AddBaseTypePlugin';

const URL = 'https://cdn.example.com/images/photo.png?w=400&h=300';
const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeImageElement(src = URL) {
  // 用 defineProperty 直接赋值，绕过 jsdom 的 canvas 图片解码依赖
  const el = document.createElement('img');
  Object.defineProperty(el, 'src', { value: src, writable: true, configurable: true });
  Object.defineProperty(el, 'width', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: 100, writable: true, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
  // 模拟 fabric.loadImage 在 anonymous 跨域加载后设置在元素上的 crossOrigin
  Object.defineProperty(el, 'crossOrigin', {
    value: 'anonymous',
    writable: true,
    configurable: true,
  });
  return el;
}

describe('在线图片导出 / 恢复', () => {
  it('toObject 导出在线 URL（而非 base64），并携带 crossOrigin', () => {
    const el = makeImageElement();
    el.src = URL;
    const img = new fabric.Image(el, { crossOrigin: 'anonymous' });
    const obj = img.toObject();
    expect(obj.type).toBe('image');
    expect(obj.src).toBe(URL);
    expect(obj.src).not.toMatch(/^data:/);
    expect(obj.crossOrigin).toBe('anonymous');
  });

  it('getSrc 返回在线 URL，不会内嵌 base64', () => {
    const el = makeImageElement();
    const img = new fabric.Image(el, { crossOrigin: 'anonymous' });
    expect(img.getSrc()).toBe(URL);
  });

  it('勾选"转成本地图片"后（src 为 base64）toObject 导出 base64 数据', () => {
    const el = makeImageElement(DATA_URL);
    const img = new fabric.Image(el, { crossOrigin: 'anonymous' });
    const obj = img.toObject();
    expect(obj.src).toMatch(/^data:image\/png;base64,/);
    expect(obj.src).not.toBe(URL);
  });

  it('编辑地址：setSrc 更新后 getSrc/toObject 反映新 URL 并保持 crossOrigin', (done) => {
    const el = makeImageElement(URL);
    const img = new fabric.Image(el, { crossOrigin: 'anonymous' });

    const NEW_URL = 'https://cdn.example.com/images/photo2.jpg?w=800';
    const newEl = makeImageElement(NEW_URL);

    const loadImageSpy = jest
      .spyOn(fabric.util, 'loadImage')
      .mockImplementation((url, cb, thisArg, crossOrigin) => {
        expect(url).toBe(NEW_URL);
        expect(crossOrigin).toBe('anonymous');
        cb.call(thisArg, newEl, false);
      });

    img.setSrc(
      NEW_URL,
      (obj, isError) => {
        expect(isError).toBe(false);
        expect(obj.getSrc()).toBe(NEW_URL);
        expect(obj.getCrossOrigin()).toBe('anonymous');
        expect(obj.toObject().src).toBe(NEW_URL);
        expect(obj.toObject().src).not.toMatch(/^data:/);
        expect(obj.toObject().crossOrigin).toBe('anonymous');
        loadImageSpy.mockRestore();
        done();
      },
      { crossOrigin: 'anonymous' }
    );
  });

  it('fromObject 恢复时使用对象中的 crossOrigin 从 URL 加载', (done) => {
    const loadImage = jest
      .spyOn(fabric.util, 'loadImage')
      .mockImplementation((url, cb, nullVal, crossOrigin) => {
        expect(url).toBe(URL);
        expect(crossOrigin).toBe('anonymous');
        cb(makeImageElement(), false);
      });
    fabric.Image.fromObject({ src: URL, crossOrigin: 'anonymous' }, (img, isError) => {
      expect(isError).toBe(false);
      expect(loadImage).toHaveBeenCalled();
      loadImage.mockRestore();
      done();
    });
  });
});

describe('AddBaseTypePlugin.getImageExtension', () => {
  const plugin = new AddBaseTypePlugin(null, null);

  it('兼容带查询参数与路径的在线 URL', () => {
    expect(plugin.getImageExtension('https://x.com/a.png?v=1')).toBe('png');
    expect(plugin.getImageExtension('https://x.com/a.svg?raw=1')).toBe('svg');
    expect(plugin.getImageExtension('https://x.com/path/to/img.JPG')).toBe('jpg');
    expect(plugin.getImageExtension('https://x.com/a#frag')).toBe('');
  });
});
