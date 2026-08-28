/**
 * 历史记录恢复（undo/redo）后系统层对象只读回归
 *
 * 背景：历史快照（getJson / canvas.toJSON）不序列化 evented/lockMovement/hoverCursor，
 * undo/redo 走 HistoryPlugin._loadState -> canvas.loadFromJSON（无 hookImportAfter 兜底），
 * workspace/背景图恢复为 fabric 默认 evented:true，背景图像普通图片一样能被鼠标命中/编辑。
 */
import { fabric } from 'fabric';
import HistoryPlugin from '../../src/core/plugin/HistoryPlugin';
import WorkspacePlugin from '../../src/core/plugin/WorkspacePlugin';
import { createBackgroundObject } from '../../src/core/workspaceGeometry';
import { stripCanvasDefaults } from '../../src/core/jsonOptimizer';

function makeImgEl(w, h, src) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'width', { value: w, configurable: true });
  Object.defineProperty(el, 'height', { value: h, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: h, configurable: true });
  if (src) {
    Object.defineProperty(el, 'src', { value: src, configurable: true });
  }
  return el;
}

function createCanvas() {
  const el = document.createElement('canvas');
  el.width = 300;
  el.height = 400;
  document.body.appendChild(el);
  return new fabric.Canvas(el, { selection: true });
}

// 与 ServersPlugin.getExtensionKey 一致的最小键集
const EXT_KEYS = [
  'id',
  'gradientAngle',
  'selectable',
  'hasControls',
  'evented',
  'editable',
  'legacyPathDims',
  'extensionType',
  'extension',
  'verticalAlign',
  'roundValue',
  'backgroundImageMode',
  'backgroundPosition',
  'isVariableImage',
  'isVariableBackground',
  'src',
  'follow',
];

// 构造与编辑器一致的画布：workspace + 背景图（系统层均只读）
function setupWorkspaceWithBg(canvas) {
  const workspace = new fabric.Rect({
    id: 'workspace',
    width: 300,
    height: 400,
    fill: '#ffffff',
  });
  workspace.set('selectable', false);
  workspace.set('evented', false);
  workspace.set('hasControls', false);
  canvas.add(workspace);
  const bg = createBackgroundObject({
    img: makeImgEl(100, 200),
    layout: { left: 0, top: 0, scaleX: 3, scaleY: 2 },
    mode: 'cover',
    position: { x: 0.5, y: 0.5 },
  });
  canvas.insertAt(bg, 1);
  return { workspace, bg };
}

function snapshot(canvas) {
  return JSON.stringify(stripCanvasDefaults(canvas.toJSON(EXT_KEYS)));
}

function findTargetAt(canvas, x, y) {
  const e = new window.MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true });
  const target = canvas.findTarget(e);
  return target ? target.id || target.type : null;
}

describe('undo/redo 恢复后系统层只读', () => {
  let loadImageSpy;

  beforeEach(() => {
    // jsdom 无法解码图片，mock loadImage 同步返回元素（fromObject 复活 fabric.Image 用）
    loadImageSpy = jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
      const el = makeImgEl(100, 200);
      cb && cb.call(thisArg, el, false);
      return el;
    });
  });

  afterEach(() => {
    loadImageSpy.mockRestore();
  });

  it('undo 恢复后背景图/workspace 保持只读，鼠标不可命中背景图', () => {
    const canvas = createCanvas();
    setupWorkspaceWithBg(canvas);
    const state = snapshot(canvas);

    const editor = { getJson: () => JSON.parse(state), emit: jest.fn() };
    const plugin = new HistoryPlugin(canvas, editor);

    plugin._loadState(state, 'history:undo', () => {
      const bg = canvas.getObjects().find((o) => o.id === 'backgroundImage');
      const ws = canvas.getObjects().find((o) => o.id === 'workspace');

      expect(bg).toBeTruthy();
      expect(bg.selectable).toBe(false);
      expect(bg.evented).toBe(false);
      expect(bg.hasControls).toBe(false);
      expect(bg.lockMovementX).toBe(true);
      expect(bg.lockMovementY).toBe(true);
      expect(bg.hoverCursor).toBe('default');

      expect(ws.evented).toBe(false);
      expect(ws.selectable).toBe(false);
      expect(ws.hasControls).toBe(false);

      // 交互层断言：undo 前后系统层都不可命中（修复前 findTarget 返回 backgroundImage）
      expect(findTargetAt(canvas, 150, 200)).toBeNull();

      // 恢复完成后通知 UI 回显（BgBar 等据此同步背景图展示状态）
      expect(editor.emit).toHaveBeenCalledWith('historyRestore');
    });
  });

  it('背景图快照携带 evented:false（getExtensionKey 序列化），loadFromJSON 直载即为只读', () => {
    const canvas = createCanvas();
    setupWorkspaceWithBg(canvas);

    const json = stripCanvasDefaults(canvas.toJSON(EXT_KEYS));
    const bgJson = json.objects.find((o) => o.id === 'backgroundImage');
    const wsJson = json.objects.find((o) => o.id === 'workspace');
    expect(bgJson.evented).toBe(false);
    expect(bgJson.selectable).toBe(false);
    expect(wsJson.evented).toBe(false);

    // 快照缺 evented 的旧数据也能被 _loadState 兜底只读
    delete bgJson.evented;
    delete wsJson.evented;
    canvas.loadFromJSON(json, () => {
      const bg = canvas.getObjects().find((o) => o.id === 'backgroundImage');
      expect(bg.evented).toBe(true); // 直载恢复默认值（模拟修复前状态）
    });
  });

  it('enforceSystemObjectsReadonly 对旧格式快照（无 evented）兜底只读', () => {
    const canvas = createCanvas();
    setupWorkspaceWithBg(canvas);

    const json = stripCanvasDefaults(canvas.toJSON(EXT_KEYS));
    json.objects.forEach((o) => {
      delete o.evented;
      delete o.lockMovementX;
      delete o.lockMovementY;
      delete o.hoverCursor;
    });

    const editor = { getJson: () => json, emit: jest.fn() };
    const plugin = new HistoryPlugin(canvas, editor);
    plugin._loadState(JSON.stringify(json), 'history:undo', () => {
      const bg = canvas.getObjects().find((o) => o.id === 'backgroundImage');
      expect(bg.selectable).toBe(false);
      expect(bg.evented).toBe(false);
      expect(bg.lockMovementX).toBe(true);
      expect(findTargetAt(canvas, 150, 200)).toBeNull();
      expect(editor.emit).toHaveBeenCalledWith('historyRestore');
    });
  });
});

describe('undo/redo 恢复后背景图状态重捕获（WorkspacePlugin）', () => {
  const BG_SRC = 'https://cdn.example.com/bg.png';

  beforeAll(() => {
    // jsdom 无 ResizeObserver / #workspace 元素，WorkspacePlugin 构造依赖
    if (!window.ResizeObserver) {
      global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (!document.querySelector('#workspace')) {
      const el = document.createElement('div');
      el.id = 'workspace';
      document.body.appendChild(el);
    }
  });

  // 最小 canvas mock（真实方法集参考 tests/unit/workspace.test.js）
  function createPluginWithMockCanvas() {
    const objs = [];
    const canvas = {
      setWidth: jest.fn(),
      setHeight: jest.fn(),
      getObjects: () => objs,
      add: jest.fn((o) => objs.push(o)),
      insertAt: jest.fn(),
      remove: jest.fn(),
      renderAll: jest.fn(),
      requestRenderAll: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      getCenter: () => ({ left: 0, top: 0 }),
      setViewportTransform: jest.fn(),
      zoomToPoint: jest.fn(),
      clipPath: null,
      backgroundImage: '',
    };
    const editor = { emit: jest.fn(), getPlugin: () => null };
    const plugin = new WorkspacePlugin(canvas, editor);
    return { plugin, canvas, editor, objs };
  }

  function makeBg() {
    return createBackgroundObject({
      img: makeImgEl(100, 200, BG_SRC),
      layout: { left: 0, top: 0, scaleX: 3, scaleY: 2 },
      mode: 'cover',
      position: { x: 0.5, y: 0.5 },
    });
  }

  it('构造时绑定画布 history:undo / history:redo 重捕获监听', () => {
    const { canvas } = createPluginWithMockCanvas();
    const undoCall = canvas.on.mock.calls.find(([name]) => name === 'history:undo');
    const redoCall = canvas.on.mock.calls.find(([name]) => name === 'history:redo');
    expect(undoCall).toBeTruthy();
    expect(redoCall).toBeTruthy();
    expect(typeof undoCall[1]).toBe('function');
  });

  it('撤销到无背景图的历史后，背景状态清空，resize 不会复活背景图', () => {
    const { plugin, canvas } = createPluginWithMockCanvas();
    // 模拟撤销前的失同步残留（背景已被撤销移除，插件状态还在）
    plugin.backgroundImageDataUrl = BG_SRC;
    plugin.backgroundImageMode = 'cover';
    plugin.backgroundImageSize = { w: 100, h: 200 };

    // 触发恢复回调（画布上已无背景图对象）
    canvas.on.mock.calls.filter(([name]) => name === 'history:undo').forEach(([, fn]) => fn());

    expect(plugin.backgroundImageDataUrl).toBeNull();
    expect(plugin.backgroundImageSize).toBeNull();
    expect(plugin.backgroundImageVariable).toBe(false);

    // 关键回归：_syncBackgroundImage 不再复活已撤销的背景图
    plugin._syncBackgroundImage();
    expect(canvas.insertAt).not.toHaveBeenCalled();
  });

  it('恢复到含背景图的历史后，重新捕获背景 src/mode/position', () => {
    const { plugin, canvas, objs } = createPluginWithMockCanvas();
    const bg = makeBg();
    objs.push(bg);

    // 模拟撤销前的失同步残留（如撤销前画布是另一张背景）
    plugin.backgroundImageDataUrl = 'https://cdn.example.com/old.png';
    plugin.backgroundImageMode = 'tile';
    plugin.backgroundImagePosition = { x: 0, y: 0 };

    canvas.on.mock.calls.filter(([name]) => name === 'history:undo').forEach(([, fn]) => fn());

    expect(plugin.backgroundImageDataUrl).toBe(BG_SRC);
    expect(plugin.backgroundImageMode).toBe('cover');
    expect(plugin.backgroundImagePosition).toEqual({ x: 0.5, y: 0.5 });
  });
});
