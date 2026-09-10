/**
 * variableImageFit（变量图渲染期版位拉伸）：
 * - 基础：宽高重置为 natural、scale = 版位/natural（独立轴拉伸铺满）
 * - clipPath 形状补偿（椭圆/圆，与编辑器 _compensatePreviewClipPath 同语义）：
 *   非等比拉伸（占位图 240x160 / 非方真实图）不再把圆拉成椭圆 ——
 *   k = 布局前/后对象 scale 反算 clip.scaleX/Y，屏幕上的裁切形状保持编辑态圆形
 */
import { fabric } from 'fabric';
import { layoutVariableImages } from '../../src/core/variableImageFit';
import './../../src/core/renderPatches';

function makeImage(nw, nh, props = {}) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'src', {
    value: 'https://x/' + props.id,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, 'width', { value: nw, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: nh, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: nw, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: nh, writable: true, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
  const img = new fabric.Image(el);
  img.set(props);
  return img;
}

describe('layoutVariableImages：版位拉伸 + 圆形 clip 补偿', () => {
  it('非等比拉伸（240x160 元素入 135 方框）不破坏圆形 clip', () => {
    // 模拟 legacy avatar 产物：json width/height=135（版位），clip 满框圆 rx=67.5
    const img = makeImage(240, 160, { id: 'legacy-avatar', isVariableImage: true });
    img.set({
      width: 135,
      height: 135,
      clipPath: new fabric.Ellipse({
        absolutePositioned: false,
        originX: 'center',
        originY: 'center',
        rx: 135 / 2,
        ry: 135 / 2,
      }),
    });
    const res = layoutVariableImages({ getObjects: () => [img] });
    expect(res).toBe(true);
    // 拉伸铺满：宽高=natural、scale=135/natural（独立轴）
    expect(img.get('width')).toBe(240);
    expect(img.get('height')).toBe(160);
    expect(img.get('scaleX')).toBeCloseTo(135 / 240, 5);
    expect(img.get('scaleY')).toBeCloseTo(135 / 160, 5);
    // clip 反缩放补偿：屏幕等效半径恒定（rx × objScale × clipScale = 67.5，直径仍满框）
    const clip = img.get('clipPath');
    expect(clip.rx * img.get('scaleX') * clip.scaleX).toBeCloseTo(67.5, 5);
    expect(clip.ry * img.get('scaleY') * clip.scaleY).toBeCloseTo(67.5, 5);
  });

  it('无 clip 的变量图：行为不变（独立轴拉伸，幂等返回 true/false）', () => {
    const img = makeImage(240, 160, { id: 'v-img', isVariableImage: true });
    img.set({ width: 60, height: 40 });
    expect(layoutVariableImages({ getObjects: () => [img] })).toBe(true);
    expect(img.get('scaleX')).toBeCloseTo(60 / 240, 5);
    expect(img.get('scaleY')).toBeCloseTo(40 / 160, 5);
    // 已对位（natural==保存宽）→ 幂等跳过
    const img2 = makeImage(100, 100, { id: 'v-img2', isVariableImage: true });
    img2.set({ width: 100, height: 100 });
    expect(layoutVariableImages({ getObjects: () => [img2] })).toBe(false);
    expect(img2.get('scaleX')).toBe(1);
  });

  it('矩形 clip（SimpleClipImagePlugin rect 形态）不做形状补偿', () => {
    const img = makeImage(240, 160, { id: 'clip-rect', isVariableImage: true });
    img.set({
      width: 135,
      height: 135,
      clipPath: new fabric.Rect({
        absolutePositioned: false,
        width: 135,
        height: 135,
        originX: 'center',
        originY: 'center',
      }),
    });
    layoutVariableImages({ getObjects: () => [img] });
    // 矩形 clip 不做形状补偿（scale 未被改变）
    expect(img.get('clipPath').scaleX).toBe(1);
  });

  it('enliven 裁剪框形态：natural ≠ 保存尺寸 + 遗留 scaleX → 按显示尺寸拉伸', () => {
    // 编辑器导出 JSON：width/height 是 crop 框（240×160），保存时遗留版位 scale
    // （displayedW = 240×1.6759 ≈ 402.2，displayedH = 160×1.1427 ≈ 182.8）
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
    expect(varImg.get('height')).toBe(500);
    expect(varImg.get('scaleX')).toBeCloseTo((240 * 1.6759) / 900, 5);
    expect(varImg.get('scaleY')).toBeCloseTo((160 * 1.1427) / 500, 5);
    expect(varImg.dirty).toBe(true);
  });

  it('跳过条件：非图片 / 无 isVariableImage 标记 / 缺元素 / 非法 canvas', () => {
    const text = { type: 'i-text', text: 'x' };
    // 无标记的旧遗留对象（含历史遗留业务字段）不走本布局，保持不动
    const plain = makeImage(900, 500, { id: 'p', width: 240, height: 160 });
    const noEl = makeImage(900, 500, { id: 'e', isVariableImage: true, width: 240, height: 160 });
    noEl.getElement = () => null;
    const canvas = { getObjects: () => [text, plain, noEl] };
    expect(layoutVariableImages(canvas)).toBe(false);
    expect(plain.get('width')).toBe(240);
    expect(layoutVariableImages(null)).toBe(false);
    expect(layoutVariableImages({})).toBe(false);
  });
});
