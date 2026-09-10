/**
 * 系统层/固定层对象交互守卫回归
 *
 * 背景：绘制模式（路径文本/多边形/自由画笔/画线）退出时会批量恢复对象
 * selectable/evented，若不跳过系统层对象，背景图会被解锁成普通图片可被选中。
 */
import { fabric } from 'fabric';
import DrawLinePlugin from '../../src/core/plugin/DrawLinePlugin';
import { isFixedLayerObject } from '../../src/core/utils/utils';
import { setupGuideLine } from '../../src/core/ruler/guideline';
import { createBackgroundObject } from '../../src/core/workspaceGeometry';

function makeImgEl(w, h) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'width', { value: w, configurable: true });
  Object.defineProperty(el, 'height', { value: h, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: h, configurable: true });
  return el;
}

function makeGuideLine(y) {
  return new fabric.GuideLine([0, y, 300, y], { axis: 'horizontal' });
}

describe('isFixedLayerObject 系统层判定', () => {
  beforeAll(() => {
    setupGuideLine();
  });

  it('workspace / 背景图 / 蒙版覆盖层 / 辅助线 为固定层', () => {
    const workspace = new fabric.Rect({ id: 'workspace' });
    const bg = new fabric.Rect({ id: 'backgroundImage' });
    const mask = new fabric.Rect({ id: 'coverMask' });
    const guide = makeGuideLine(100);
    expect(isFixedLayerObject(workspace)).toBe(true);
    expect(isFixedLayerObject(bg)).toBe(true);
    expect(isFixedLayerObject(mask)).toBe(true);
    expect(isFixedLayerObject(guide)).toBe(true);
  });

  it('普通对象与非对象值为 false', () => {
    expect(isFixedLayerObject(new fabric.Rect({}))).toBe(false);
    expect(isFixedLayerObject(new fabric.IText('a'))).toBe(false);
    expect(isFixedLayerObject(null)).toBe(false);
    expect(isFixedLayerObject(undefined)).toBe(false);
  });
});

describe('DrawLinePlugin.endRest 退出画线模式不解锁系统层', () => {
  function createPlugin() {
    const objs = [];
    const canvas = {
      on: jest.fn(),
      off: jest.fn(),
      getObjects: () => objs,
      discardActiveObject: jest.fn(),
      requestRenderAll: jest.fn(),
      renderAll: jest.fn(),
      getPointer: () => ({ x: 0, y: 0 }),
    };
    const editor = { saveState: jest.fn(), emit: jest.fn() };
    const plugin = new DrawLinePlugin(canvas, editor);
    return { plugin, objs };
  }

  it('普通对象恢复可选中，系统层保持只读', () => {
    const { plugin, objs } = createPlugin();

    const workspace = new fabric.Rect({ id: 'workspace' });
    workspace.set('selectable', false);
    workspace.set('hasControls', false);
    const bg = createBackgroundObject({
      img: makeImgEl(100, 200),
      layout: { left: 0, top: 0, scaleX: 3, scaleY: 2 },
      mode: 'cover',
      position: { x: 0.5, y: 0.5 },
    });
    const mask = new fabric.Rect({ id: 'coverMask' });
    mask.set('selectable', false);
    mask.set('hasControls', false);
    const guide = makeGuideLine(100);

    // 画线时被禁用状态的普通对象
    const normal = new fabric.Rect({});
    normal.selectable = false;
    normal.hasControls = false;

    objs.push(workspace, bg, mask, guide, normal);

    plugin.setMode(false);

    // 普通对象恢复
    expect(normal.selectable).toBe(true);
    expect(normal.hasControls).toBe(true);
    // 系统层保持原交互态（修复前 bg 会被解锁为 selectable=true/hasControls=true）
    expect(bg.selectable).toBe(false);
    expect(bg.hasControls).toBe(false);
    expect(workspace.selectable).toBe(false);
    expect(workspace.hasControls).toBe(false);
    expect(mask.selectable).toBe(false);
    expect(mask.hasControls).toBe(false);
    expect(guide.selectable).toBe(false);
    expect(guide.hasControls).toBe(false);
  });
});
