import WorkspacePlugin from '../../src/core/plugin/WorkspacePlugin';
import { fabric } from 'fabric';

function makeImgEl(w, h) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'width', { value: w, configurable: true });
  Object.defineProperty(el, 'height', { value: h, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: h, configurable: true });
  return el;
}

// 绕过构造函数（需要真实 DOM #workspace），直接以最小字段组装插件实例
function setup({ bgMode = 'cover', bgSize = { w: 100, h: 200 }, withBg = true } = {}) {
  const workspace = new fabric.Rect({ id: 'workspace', left: 0, top: 0, width: 600, height: 800 });
  const objs = [workspace];
  let bg = null;
  if (withBg) {
    if (bgMode === 'tile') {
      bg = new fabric.Rect({
        id: 'backgroundImage',
        backgroundImageMode: 'tile',
        left: 0,
        top: 0,
        width: 600,
        height: 800,
        fill: new fabric.Pattern({ source: makeImgEl(bgSize.w, bgSize.h), repeat: 'repeat' }),
      });
    } else {
      bg = new fabric.Image(makeImgEl(bgSize.w, bgSize.h), {
        id: 'backgroundImage',
        backgroundImageMode: bgMode,
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
      });
    }
    objs.push(bg);
  }
  const canvas = {
    setWidth: jest.fn(),
    setHeight: jest.fn(),
    getObjects: () => objs,
    add: jest.fn(),
    insertAt: jest.fn(),
    remove: jest.fn(),
    renderAll: jest.fn(),
    requestRenderAll: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    clipPath: null,
    backgroundImage: '',
  };
  const editor = { emit: jest.fn(), getPlugin: jest.fn(() => null) };
  const plugin = Object.create(WorkspacePlugin.prototype);
  plugin.canvas = canvas;
  plugin.editor = editor;
  plugin.workspace = workspace;
  plugin.workspaceEl = { offsetWidth: 600, offsetHeight: 800 };
  plugin.option = { width: 600, height: 800 };
  plugin.backgroundImageDataUrl = withBg ? 'data:image/png;base64,AAAA' : null;
  plugin.backgroundImageMode = bgMode;
  plugin.backgroundImageSize = withBg ? bgSize : null;
  plugin.backgroundImageOpacity = 1;
  workspace.clone = (cb) => {
    const cloned = new fabric.Rect({
      left: workspace.left,
      top: workspace.top,
      width: workspace.width,
      height: workspace.height,
    });
    cb(cloned);
  };
  return { plugin, workspace, bg, canvas, editor, objs };
}

describe('WorkspacePlugin.setSizeSilent 同步 clipPath 与背景图', () => {
  it('增高后 clipPath 跟随新尺寸（裁切区域不再截断内容）', () => {
    const { plugin, canvas } = setup();
    plugin.setSizeSilent(600, 1000);
    expect(canvas.clipPath).toBeTruthy();
    expect(canvas.clipPath.get('width')).toBe(600);
    expect(canvas.clipPath.get('height')).toBe(1000);
  });

  it('增高后 cover 背景图就地同步（对象不重建、几何跟随）', () => {
    const { plugin, bg, workspace } = setup({ bgMode: 'cover', bgSize: { w: 100, h: 200 } });
    plugin.setSizeSilent(600, 1000);
    // rectRatio=0.6 > imgRatio=0.5 → cover scale = rectH/imgH = 5
    expect(bg.get('scaleX')).toBeCloseTo(5);
    expect(bg.get('scaleY')).toBeCloseTo(5);
    expect(bg.get('left')).toBeCloseTo(50); // (600 - 100*5) / 2
    expect(bg.get('top')).toBeCloseTo(0); // (1000 - 200*5) / 2
    expect(workspace.get('height')).toBe(1000);
  });

  it('contain 模式背景就地同步', () => {
    const { plugin, bg } = setup({ bgMode: 'contain', bgSize: { w: 100, h: 200 } });
    plugin.setSizeSilent(600, 1000);
    // 0.6 > 0.5 → contain scale = rectW/imgW = 6
    expect(bg.get('scaleX')).toBeCloseTo(6);
    expect(bg.get('left')).toBeCloseTo(0);
    expect(bg.get('top')).toBeCloseTo(-100); // (1000 - 200*6) / 2
  });

  it('tile 平铺背景就地同步（尺寸跟随）', () => {
    const { plugin, bg } = setup({ bgMode: 'tile' });
    plugin.setSizeSilent(600, 1000);
    expect(bg.get('width')).toBe(600);
    expect(bg.get('height')).toBe(1000);
  });

  it('连续增高不重建背景对象（避免异步竞态导致背景丢失）', () => {
    const { plugin, canvas, bg } = setup({ bgMode: 'cover', bgSize: { w: 100, h: 200 } });
    plugin.setSizeSilent(600, 900);
    const ref = canvas.getObjects().find((o) => o.id === 'backgroundImage');
    expect(ref).toBe(bg);
    plugin.setSizeSilent(600, 1000);
    plugin.setSizeSilent(600, 1100);
    expect(canvas.getObjects().find((o) => o.id === 'backgroundImage')).toBe(bg);
    expect(bg.get('scaleX')).toBeCloseTo(5.5); // 1100 / 200
    expect(bg.get('scaleY')).toBeCloseTo(5.5);
  });

  it('无背景图时增高不报错', () => {
    const { plugin } = setup({ withBg: false });
    expect(() => plugin.setSizeSilent(600, 1000)).not.toThrow();
  });

  it('clipPath 兜底：乱序克隆回调也以最新 workspace 几何为准', () => {
    const { plugin, workspace, canvas } = setup();
    const queue = [];
    workspace.clone = (cb) => {
      // 克隆时锁定当时的几何（模拟 fabric 异步序列化的滞后性）
      const snapshot = {
        width: workspace.get('width'),
        height: workspace.get('height'),
        left: workspace.get('left'),
        top: workspace.get('top'),
      };
      queue.push(() => {
        const cloned = new fabric.Rect(snapshot);
        cb(cloned);
      });
    };
    plugin.setSizeSilent(600, 900); // 回调 A：克隆几何 900
    plugin.setSizeSilent(600, 1100); // 回调 B：克隆几何 1100
    queue[0](); // 乱序先执行旧回调 A：兜底应覆盖为当前几何 1100
    expect(canvas.clipPath.get('height')).toBe(1100);
    queue[1]();
    expect(canvas.clipPath.get('height')).toBe(1100);
  });

  it('syncBackgroundImage 公开 API：就地同步并触发渲染', () => {
    const { plugin, bg, canvas } = setup({ bgMode: 'cover', bgSize: { w: 100, h: 200 } });
    plugin.workspace.set({ height: 1000 });
    plugin.syncBackgroundImage();
    expect(bg.get('scaleX')).toBeCloseTo(5);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
});
