/**
 * EscHotKeyPlugin 回归：ESC 取消选中
 * - 无激活对象：不动作
 * - 单选/多选激活：discardActiveObject 清选中
 * - 文本编辑中：先 exitEditing、保留选中（fabric 惯例）
 * - 非 keydown 事件不处理
 */
import { fabric } from 'fabric';
import EscHotKeyPlugin from '../../src/core/plugin/EscHotKeyPlugin';

jest.mock('../../src/core/utils/utils', () => ({
  selectFiles: jest.fn(),
  downFile: jest.fn(),
  getImgStr: jest.fn(() => Promise.resolve(null)),
}));

function createCanvas() {
  const el = document.createElement('canvas');
  el.width = 300;
  el.height = 400;
  document.body.appendChild(el);
  return new fabric.Canvas(el, { selection: false, skipTargetFind: true });
}

function createEditor() {
  return {};
}

describe('EscHotKeyPlugin：ESC 取消选中', () => {
  it('无激活对象：不崩溃且无副作用', () => {
    const canvas = createCanvas();
    const plugin = new EscHotKeyPlugin(canvas, createEditor());
    expect(() => plugin.hotkeyEvent('esc', { type: 'keydown' })).not.toThrow();
    expect(canvas.getActiveObject()).toBeFalsy();
  });

  it('单选激活：discardActiveObject 清空选中', () => {
    const canvas = createCanvas();
    const plugin = new EscHotKeyPlugin(canvas, createEditor());
    const rect = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    plugin.hotkeyEvent('esc', { type: 'keydown' });
    expect(canvas.getActiveObject()).toBeFalsy();
    expect(rect.isEditing || false).toBe(false);
  });

  it('多选激活：一并取消', () => {
    const canvas = createCanvas();
    const plugin = new EscHotKeyPlugin(canvas, createEditor());
    const a = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 });
    const b = new fabric.Rect({ left: 20, top: 20, width: 10, height: 10 });
    canvas.add(a, b);
    const sel = new fabric.ActiveSelection(canvas.getObjects(), { canvas });
    canvas.setActiveObject(sel);
    expect(canvas.getActiveObject()).toBeTruthy();
    plugin.hotkeyEvent('esc', { type: 'keydown' });
    expect(canvas.getActiveObject()).toBeFalsy();
  });

  it('文本编辑中：仅退出编辑，保留选中', () => {
    const canvas = createCanvas();
    const plugin = new EscHotKeyPlugin(canvas, createEditor());
    const textbox = new fabric.Textbox('edit', { left: 0, top: 0, width: 100 });
    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    textbox.enterEditing();
    expect(textbox.isEditing).toBe(true);
    plugin.hotkeyEvent('esc', { type: 'keydown' });
    expect(textbox.isEditing).toBe(false);
    expect(canvas.getActiveObject()).toMatchObject({ type: 'textbox' });
  });

  it('非 keydown 事件不处理（keyup/keydown repeat 语义）', () => {
    const canvas = createCanvas();
    const plugin = new EscHotKeyPlugin(canvas, createEditor());
    const rect = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    plugin.hotkeyEvent('esc', { type: 'keyup' });
    expect(canvas.getActiveObject()).toBeTruthy();
  });

  it('hotkeys 配置为 esc；插件元信息完整', () => {
    const canvas = createCanvas();
    const plugin = new EscHotKeyPlugin(canvas, createEditor());
    expect(EscHotKeyPlugin.pluginName).toBe('EscHotKeyPlugin');
    expect(EscHotKeyPlugin.apis).toEqual(['exit']);
    expect(EscHotKeyPlugin.events).toEqual([]);
    expect(plugin.hotkeys).toEqual(['esc']);
    expect(typeof plugin.exit).toBe('function');
    canvas.dispose();
  });
});
