/*
 * layoutVariableImages：变量图渲染期布局（拉伸到版位，与编辑器变量预览同语义）
 */
import { fabric } from 'fabric';
import { layoutVariableImages } from '../variableImageFit';

// fabric.Image + 指定 natural 尺寸的元素（props 经 _setOptions 应用，width/height 即 crop 语义）
function makeImage(nw, nh, props = {}) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'width', { value: nw, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: nh, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: nw, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: nh, writable: true, configurable: true });
  return new fabric.Image(el, props);
}

describe('layoutVariableImages：变量图按版位显示尺寸拉伸铺满', () => {
  it('标准变量图（编辑器导出）：natural ≠ 保存尺寸 → 拉伸到版位', () => {
    // enliven 语义：element natural=900x500；JSON width=240/height=160（保存时版位尺寸）
    // 被还原为 crop 框 → 显示为左上角裁剪切片
    const varImg = makeImage(900, 500, {
      id: 'v',
      isVariableImage: true,
      width: 240,
      height: 160,
      scaleX: 1.6759,
      scaleY: 1.1427,
    });
    const canvas = { getObjects: () => [varImg] };
    expect(layoutVariableImages(canvas)).toBe(true);
    // 拉伸铺满版位：displayedW = 240×1.6759 ≈ 402.2，displayedH = 160×1.1427 ≈ 182.8
    expect(varImg.get('width')).toBe(900);
    expect(varImg.get('height')).toBe(500);
    expect(varImg.get('scaleX')).toBeCloseTo((240 * 1.6759) / 900, 5);
    expect(varImg.get('scaleY')).toBeCloseTo((160 * 1.1427) / 500, 5);
    expect(varImg.dirty).toBe(true);
  });

  it('在线图（natural == 保存尺寸）：恒等变换跳过；布局完成后重复执行幂等', () => {
    // 在线图：natural == 保存尺寸 → 跳过
    const online = makeImage(100, 100, {
      id: 'o',
      isVariableImage: true,
      width: 100,
      height: 100,
      scaleX: 1.5,
      scaleY: 1.5,
    });
    expect(layoutVariableImages({ getObjects: () => [online] })).toBe(false);
    expect(online.get('width')).toBe(100);
    expect(online.get('scaleX')).toBe(1.5);
    // 变量图布局一次后（width == natural）：重复执行差值≈0 → 不再变更（幂等）
    const varImg = makeImage(900, 500, {
      id: 'v',
      isVariableImage: true,
      width: 240,
      height: 160,
      scaleX: 1.6759,
      scaleY: 1.1427,
    });
    expect(layoutVariableImages({ getObjects: () => [varImg] })).toBe(true);
    expect(varImg.get('width')).toBe(900);
    expect(layoutVariableImages({ getObjects: () => [varImg] })).toBe(false);
    expect(varImg.get('width')).toBe(900);
  });

  it('非图片 / 无 isVariableImage 标记 / 缺元素：跳过', () => {
    const text = { type: 'i-text', text: 'x' };
    const plain = makeImage(900, 500, { id: 'p', width: 240, height: 160 });
    const noEl = makeImage(900, 500, { id: 'e', isVariableImage: true, width: 240, height: 160 });
    noEl.getElement = () => null;
    const canvas = { getObjects: () => [text, plain, noEl] };
    expect(layoutVariableImages(canvas)).toBe(false);
    expect(plain.get('width')).toBe(240);
  });

  it('legacy 业务标记对象（legacyVariableImg / legacyAvatar）不在此处理，保持不动', () => {
    // lib 只感知变量体系概念；legacy 转换产物标记由业务消费方渲染后钩子布局
    const legacyImg = makeImage(900, 500, {
      id: 'l',
      legacyVariableImg: { w: 60, h: 70 },
      width: 240,
      height: 160,
      scaleX: 1.6759,
      scaleY: 1.1427,
    });
    const canvas = { getObjects: () => [legacyImg] };
    expect(layoutVariableImages(canvas)).toBe(false);
    expect(legacyImg.get('width')).toBe(240);
    expect(legacyImg.get('scaleX')).toBeCloseTo(1.6759, 5);
  });

  it('非法 canvas 返回 false', () => {
    expect(layoutVariableImages(null)).toBe(false);
    expect(layoutVariableImages({})).toBe(false);
  });
});
