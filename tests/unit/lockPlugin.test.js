import { fabric } from 'fabric';
import LockPlugin from '../../src/core/plugin/LockPlugin';
import { SelectEvent } from '../../src/core/eventType';

function makeImgEl(w, h) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'width', { value: w, configurable: true });
  Object.defineProperty(el, 'height', { value: h, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: h, configurable: true });
  return el;
}

// 绕过构造函数（init 会补 DOM + 修改 fabric 原型），直接以最小字段组装插件实例
function makePlugin(objs) {
  const canvas = {
    _active: null,
    forEachObject: (cb) => objs.forEach((o) => cb(o)),
    getActiveObject() {
      return this._active;
    },
    getActiveObjects() {
      return this._active ? [this._active] : [];
    },
    setActiveObject(o) {
      this._active = o;
      return this;
    },
    renderAll: jest.fn(),
    requestRenderAll: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const editor = { emit: jest.fn() };
  const plugin = Object.create(LockPlugin.prototype);
  plugin.canvas = canvas;
  plugin.editor = editor;
  return { plugin, canvas, editor };
}

describe('LockPlugin.hookImportAfter 导入后不选中系统层', () => {
  it('工作区与背景同为 selectable:false/hasControls:false，均不被设为激活对象（导入后无默认选中）', async () => {
    const workspace = new fabric.Rect({ id: 'workspace', selectable: false, hasControls: false });
    const bg = new fabric.Image(makeImgEl(100, 200), {
      id: 'backgroundImage',
      selectable: false,
      hasControls: false,
      backgroundImageMode: 'cover',
    });
    const normal = new fabric.Rect({ id: 'n1', selectable: true, hasControls: true });
    const { plugin, canvas } = makePlugin([workspace, bg, normal]);
    await plugin.hookImportAfter();
    // 系统层（工作区/背景）都不参与 setActiveObject → 无默认选中对象
    expect(canvas._active).toBeNull();
  });

  it('用户锁定对象仍会被选中加锁，工作区/背景跳过不受影响', async () => {
    const workspace = new fabric.Rect({ id: 'workspace', selectable: false, hasControls: false });
    const bg = new fabric.Image(makeImgEl(100, 200), {
      id: 'backgroundImage',
      selectable: false,
      hasControls: false,
    });
    const locked = new fabric.Rect({ id: 'userLocked', selectable: false, hasControls: false });
    const { plugin, canvas, editor } = makePlugin([workspace, bg, locked]);
    await plugin.hookImportAfter();
    expect(canvas._active && canvas._active.id).toBe('userLocked');
    expect(editor.emit).toHaveBeenCalledWith(SelectEvent.ONE, [locked]);
    expect(locked.lockMovementX).toBe(true);
  });
});