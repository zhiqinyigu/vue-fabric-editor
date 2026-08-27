import WorkspacePlugin from '../../src/core/plugin/WorkspacePlugin';
import { computeBackgroundLayout } from '../../src/core/workspaceGeometry';
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
    // rectRatio=0.6 > imgRatio=0.5 → cover scale = rectW/imgW = 6（铺满宽度，上下裁剪）
    expect(bg.get('scaleX')).toBeCloseTo(6);
    expect(bg.get('scaleY')).toBeCloseTo(6);
    expect(bg.get('left')).toBeCloseTo(0); // (600 - 100*6) / 2
    expect(bg.get('top')).toBeCloseTo(-100); // (1000 - 200*6) / 2
    expect(workspace.get('height')).toBe(1000);
  });

  it('contain 模式背景就地同步', () => {
    const { plugin, bg } = setup({ bgMode: 'contain', bgSize: { w: 100, h: 200 } });
    plugin.setSizeSilent(600, 1000);
    // 0.6 > 0.5 → contain scale = rectH/imgH = 5（整体可见）
    expect(bg.get('scaleX')).toBeCloseTo(5);
    expect(bg.get('left')).toBeCloseTo(50);
    expect(bg.get('top')).toBeCloseTo(0); // (1000 - 200*5) / 2
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
    expect(bg.get('scaleX')).toBeCloseTo(6); // 600 / 100（铺满宽度）
    expect(bg.get('scaleY')).toBeCloseTo(6);
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
    expect(bg.get('scaleX')).toBeCloseTo(6);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
});

describe('WorkspacePlugin 背景图对齐（backgroundPosition 数值系数）', () => {
  it('setBackgroundPosition 就地重排（contain：left/top 随对齐移动）', () => {
    const { plugin, bg } = setup({ bgMode: 'contain', bgSize: { w: 100, h: 200 } });
    // contain：workspace 600x800、原图 100x200 → scale = 800/200 = 4，宽 400、高 800
    plugin.setBackgroundPosition(0, 0);
    expect(bg.get('backgroundPosition')).toEqual({ x: 0, y: 0 });
    expect(bg.get('scaleX')).toBeCloseTo(4);
    expect(bg.get('left')).toBeCloseTo(0); // (600-400)*0
    expect(bg.get('top')).toBeCloseTo(0); // (800-800)*0
    plugin.setBackgroundPosition(1, 1);
    expect(bg.get('left')).toBeCloseTo(200); // (600-400)*1
    expect(bg.get('top')).toBeCloseTo(0);
    plugin.setBackgroundPosition(0.5, 0.5);
    expect(bg.get('left')).toBeCloseTo(100); // (600-400)*0.5
  });

  it('getBackgroundImage 返回 position（缺省居中）', () => {
    const { plugin, bg } = setup({ bgMode: 'contain', bgSize: { w: 100, h: 200 } });
    expect(plugin.getBackgroundImage().position).toEqual({ x: 0.5, y: 0.5 });
    plugin.setBackgroundPosition(0, 1);
    expect(plugin.getBackgroundImage().position).toEqual({ x: 0, y: 1 });
    expect(bg.get('backgroundPosition')).toEqual({ x: 0, y: 1 });
  });

  it('computeBackgroundLayout 纯函数：数值 position 偏移', () => {
    const workspace = { width: 600, height: 800, left: 0, top: 0, scaleX: 1, scaleY: 1 };
    const layout = computeBackgroundLayout({
      workspace,
      imageSize: { w: 100, h: 200 },
      mode: 'contain',
      position: { x: 1, y: 0 },
    });
    expect(layout.scaleX).toBeCloseTo(4);
    expect(layout.left).toBeCloseTo(200);
    expect(layout.top).toBeCloseTo(0);
  });

  it('tile 模式忽略对齐（铺满无偏移空间）', () => {
    const layout = computeBackgroundLayout({
      workspace: { width: 600, height: 800, left: 10, top: 20, scaleX: 1, scaleY: 1 },
      imageSize: { w: 100, h: 200 },
      mode: 'tile',
      position: { x: 1, y: 1 },
    });
    expect(layout).toEqual({ left: 10, top: 20, width: 600, height: 800 });
  });
});
