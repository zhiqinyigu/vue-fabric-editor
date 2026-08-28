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


describe('WorkspacePlugin 变量背景（setBackgroundVariableImage 分流 / 守卫）', () => {
  function makeVarSetup() {
    const base = setup({ withBg: false });
    const vp = {
      _makePlaceholder: () => 'data:image/png;base64,PLACEHOLDER',
      _extractVariableLabel: () => 'user.bg',
      containsVariable: (s) => typeof s === 'string' && s.includes('{{'),
      _patchGetSrc: (obj) => {
        obj.getSrc = function () {
          return this.get('src');
        };
        return obj;
      },
    };
    base.editor.getPlugin = jest.fn(() => vp);
    base.editor.saveState = jest.fn();
    base.canvas.insertAt.mockImplementation((obj) => base.objs.push(obj));
    return base;
  }

  it('setBackgroundImage 命中变量 URL → 占位呈现（isVariableBackground + getSrc 输出变量串）', () => {
    const { plugin, editor } = makeVarSetup();
    const mock = jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      cb.call(thisArg, makeImgEl(240, 160), false);
    });
    plugin.setBackgroundImage('{{user.bg}}', 'cover', { x: 0.5, y: 0.5 });
    const bg = plugin._getBackgroundImageObj();
    expect(bg).toBeTruthy();
    expect(bg.get('isVariableBackground')).toBe(true);
    expect(bg.get('src')).toBe('{{user.bg}}');
    expect(bg.getSrc()).toBe('{{user.bg}}');
    expect(bg.get('backgroundImageMode')).toBe('cover');
    expect(plugin.backgroundImageVariable).toBe(true);
    expect(editor.saveState).toHaveBeenCalled();
    mock.mockRestore();
  });

  it('普通 URL 不走变量背景（分流不误伤）', () => {
    const { plugin } = makeVarSetup();
    // jsdom 无法解码图片，mock Image 避免 setBackgroundImage 的 new Image().src 崩溃
    const RealImage = global.Image;
    global.Image = class {
      set src(v) {
        this._src = v;
        this.onerror && this.onerror();
      }
    };
    try {
      const spy = jest.spyOn(plugin, 'setBackgroundVariableImage').mockImplementation(() => {});
      plugin.setBackgroundImage('https://x/bg.webp', 'cover', { x: 0.5, y: 0.5 });
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    } finally {
      global.Image = RealImage;
    }
  });

  it('fitCanvasToBackground 对变量背景禁用（真实尺寸未知）', () => {
    const { plugin } = makeVarSetup();
    plugin.backgroundImageVariable = true;
    plugin.backgroundImageSize = { w: 240, h: 160 };
    const setSize = jest.fn();
    plugin.setSize = setSize;
    plugin.fitCanvasToBackground();
    expect(setSize).not.toHaveBeenCalled();
  });

  it('_syncBackgroundImage 对变量背景跳过异步重建（防变量 URL 重载失败）', () => {
    const { plugin } = makeVarSetup();
    plugin.backgroundImageVariable = true;
    plugin.backgroundImageDataUrl = '{{user.bg}}';
    const silent = jest.fn();
    plugin._syncBackgroundImageSilent = silent;
    const spy = jest.spyOn(plugin, 'setBackgroundImage').mockImplementation(() => {});
    plugin._syncBackgroundImage();
    expect(silent).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('setBackgroundMode 就地更新 mode（不重建对象）', () => {
    const { plugin, canvas } = setup({ bgMode: 'cover', bgSize: { w: 100, h: 200 } });
    plugin.editor.saveState = jest.fn();
    plugin.setBackgroundMode('contain');
    expect(plugin.backgroundImageMode).toBe('contain');
    expect(plugin._getBackgroundImageObj().get('backgroundImageMode')).toBe('contain');
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });
});

describe('WorkspacePlugin 变量背景：导入还原（tile）与增高联动', () => {
  // 模拟 fabric enliven 出的元素：src 固定为变量 URL（避免 jsdom 对相对路径做 URL 解析）
  function makeSrcEl(src) {
    const el = document.createElement('img');
    Object.defineProperty(el, 'src', { value: src, configurable: true });
    return el;
  }
  // 构造"最小化导出 → 重新导入"后的状态：
  // src 为变量 URL，fill.source 是尝试加载变量 URL 的 Pattern（fabric 加载必失败）
  function makeImportedVarBgSetup() {
    const base = setup({ bgMode: 'tile' });
    base.bg.set('isVariableBackground', true);
    base.bg.set('src', '{{user.bg}}');
    base.bg.set('fill', new fabric.Pattern({ source: makeSrcEl('{{user.bg}}'), repeat: 'repeat' }));
    base.editor.getPlugin = jest.fn(() => ({
      containsVariable: (s) => typeof s === 'string' && s.includes('{{'),
      _makePlaceholder: () => 'data:image/png;base64,PLACEHOLDER',
    }));
    return base;
  }

  it('导入后 tile 变量背景用占位图重建 Pattern（保留 Rect 引用与 repeat）', () => {
    const { plugin, bg, canvas } = makeImportedVarBgSetup();
    const placeholderEl = makeImgEl(240, 160);
    const mock = jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      cb.call(thisArg, placeholderEl, false);
    });
    plugin._restoreVariableBackgroundAfterImport();
    // 保留原 Rect（不重建对象），仅替换 Pattern
    expect(plugin._getBackgroundImageObj()).toBe(bg);
    expect(mock).toHaveBeenCalled();
    expect(bg.fill).toBeInstanceOf(fabric.Pattern);
    expect(bg.fill.source).toBe(placeholderEl);
    expect(bg.fill.repeat).toBe('repeat');
    expect(bg.dirty).toBe(true);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
    mock.mockRestore();
  });

  it('还原守卫：非变量标记 / image 形态均不加载占位图', () => {
    // 普通 tile 背景（无 isVariableBackground 标记）
    const a = setup({ bgMode: 'tile' });
    a.editor.getPlugin = jest.fn(() => ({ containsVariable: () => true }));
    const mockA = jest.spyOn(fabric.util, 'loadImage');
    a.plugin._restoreVariableBackgroundAfterImport();
    expect(mockA).not.toHaveBeenCalled();
    mockA.mockRestore();

    // 变量 image 形态背景：由 VariablePlugin._restoreVariableImages 处理，不在此分支
    const b = setup({ bgMode: 'cover' });
    b.bg.set('isVariableBackground', true);
    b.bg.set('src', '{{user.bg}}');
    b.editor.getPlugin = jest.fn(() => ({
      containsVariable: () => true,
      _makePlaceholder: () => 'data:image/png;base64,PLACEHOLDER',
    }));
    const mockB = jest.spyOn(fabric.util, 'loadImage');
    b.plugin._restoreVariableBackgroundAfterImport();
    expect(mockB).not.toHaveBeenCalled();
    mockB.mockRestore();
  });

  it('占位图加载失败时静默（不改动原 Pattern）', () => {
    const { plugin, bg } = makeImportedVarBgSetup();
    const originalFill = bg.fill;
    const mock = jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      cb.call(thisArg, null, true);
    });
    expect(() => plugin._restoreVariableBackgroundAfterImport()).not.toThrow();
    expect(bg.fill).toBe(originalFill);
    mock.mockRestore();
  });

  it('hookImportAfter 调用链包含变量背景还原（不依赖具体实现）', async () => {
    const { plugin } = makeImportedVarBgSetup();
    plugin.setSize = jest.fn();
    plugin.auto = jest.fn();
    const restore = jest
      .spyOn(plugin, '_restoreVariableBackgroundAfterImport')
      .mockImplementation(() => {});
    await plugin.hookImportAfter();
    expect(restore).toHaveBeenCalled();
    restore.mockRestore();
  });

  it('增高时变量背景按实时自然尺寸重排（而非占位图尺寸）', () => {
    const placeholderSize = { w: 240, h: 160 };
    const liveSize = { w: 1366, h: 768 };
    const { plugin, bg } = setup({ bgMode: 'cover', bgSize: placeholderSize });
    plugin.backgroundImageVariable = true;
    plugin.backgroundImageSize = placeholderSize; // 设计期占位基准
    bg._element = makeImgEl(liveSize.w, liveSize.h); // 预览期真实图元素
    plugin.setSizeSilent(600, 1200);
    // cover：rectRatio(0.5) < imgRatio(1.7789) → scale = rectH/imgH
    const scale = 1200 / liveSize.h;
    expect(bg.get('scaleX')).toBeCloseTo(scale, 4);
    expect(bg.get('scaleY')).toBeCloseTo(scale, 4);
    expect(bg.get('left')).toBeCloseTo((600 - liveSize.w * scale) / 2, 4);
    // 对照：若误用占位尺寸会得到 1200/160 = 7.5
    expect(bg.get('scaleX')).not.toBeCloseTo(1200 / placeholderSize.h, 4);
  });

  it('实时尺寸不可用时回退设计期占位尺寸', () => {
    const placeholderSize = { w: 240, h: 160 };
    const { plugin, bg } = setup({ bgMode: 'cover', bgSize: placeholderSize });
    plugin.backgroundImageVariable = true;
    plugin.backgroundImageSize = placeholderSize;
    bg._element = makeImgEl(0, 0); // 坏元素：naturalWidth/Height = 0
    plugin.setSizeSilent(600, 1200);
    expect(bg.get('scaleX')).toBeCloseTo(1200 / placeholderSize.h, 4);
  });
});
