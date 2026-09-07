/**
 * CopyPlugin 复制/粘贴回归（copy 事件 + 纯文字 + 自定义 MIME + 哨兵）
 * - copyListener：text/plain 写入元素纯文字（外部应用可见内容），自定义 MIME 写入对象快照
 * - 编辑态/输入框复制：不干预原生文本复制，并使哨兵失效
 * - 粘贴 MIME 快照：克隆一份，且 ctrl+v 的 setTimeout 兜底不重复克隆
 * - 粘贴哨兵路径（MIME 丢失，如 Safari）：按 cache 克隆，支持连续粘贴
 * - 外部粘贴：insertChars 插入激活文本框 / 无激活文本框时新建 IText，cache 清空
 * - ctrl+c/ctrl+v 兜底路径与 destroy 解绑
 */
import { fabric } from 'fabric';
import '../../src/core/objects/CustomTextbox';
import '../../src/core/objects/stylesCompat';

jest.mock('../../src/core/utils/utils', () => ({
  selectFiles: jest.fn(),
  downFile: jest.fn(),
  getImgStr: jest.fn(() => Promise.resolve(null)),
}));

import CopyPlugin, { VFE_COPY_MIME } from '../../src/core/plugin/CopyPlugin';

function createCanvas() {
  const el = document.createElement('canvas');
  el.width = 300;
  el.height = 400;
  document.body.appendChild(el);
  return new fabric.Canvas(el, { selection: false, skipTargetFind: true });
}

function createEditor() {
  return {
    getExtensionKey: () => [],
    getPlugin: () => null,
  };
}

// 每个用例创建的插件统一销毁，避免 copy/paste 监听器跨用例串扰
const created = [];
function createPlugin(canvas, editor) {
  const plugin = new CopyPlugin(canvas, editor);
  created.push(plugin);
  return plugin;
}

afterEach(() => {
  while (created.length) {
    created.pop().destroy();
  }
});

function setFocus(el) {
  Object.defineProperty(document, 'activeElement', { value: el, configurable: true });
}

// 构造粘贴事件并调用 pasteListener（焦点临时指向 activeElement）
function dispatchPaste(
  plugin,
  { text = '', items = [], mime = null, activeElement = document.body }
) {
  const prevActive = document.activeElement;
  setFocus(activeElement);
  const clipboardData = {
    getData: (type) => {
      if (type === VFE_COPY_MIME) return mime;
      if (type === 'text/plain') return text;
      return '';
    },
    items,
  };
  const ev = { clipboardData, preventDefault: jest.fn() };
  plugin.pasteListener(ev);
  setFocus(prevActive);
  return ev;
}

function fakeCopyEvent() {
  return {
    clipboardData: { setData: jest.fn() },
    preventDefault: jest.fn(),
  };
}

function getSetDataCall(ev, type) {
  const call = ev.clipboardData.setData.mock.calls.find((c) => c[0] === type);
  return call && call[1];
}

describe('CopyPlugin 复制/粘贴', () => {
  describe('_getCopyPureText 纯文字提取', () => {
    it('文本元素取 text', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('新建文本', { left: 0, top: 0, width: 200 });
      expect(plugin._getCopyPureText(tb)).toBe('新建文本');
    });

    it('多选取子元素文字按换行拼接', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const sel = {
        type: 'activeSelection',
        _objects: [{ text: '第一行' }, { fill: '#fff' }, { text: '第二行' }],
      };
      expect(plugin._getCopyPureText(sel)).toBe('第一行\n第二行');
    });

    it('非文本类型为空串', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const rect = new fabric.Rect({ width: 10, height: 10 });
      expect(plugin._getCopyPureText(rect)).toBe('');
    });
  });

  describe('copyListener', () => {
    it('画布内复制：text/plain 为纯文字（不含 JSON），MIME 为对象快照', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('新建文本', { left: 0, top: 0, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);

      const ev = fakeCopyEvent();
      plugin.copyListener(ev);

      const plain = getSetDataCall(ev, 'text/plain');
      expect(plain).toBe('新建文本');
      expect(plain).not.toContain('"type"');
      expect(plain).not.toContain('__VFE_COPY__');

      const payloadText = getSetDataCall(ev, VFE_COPY_MIME);
      const payload = JSON.parse(payloadText);
      expect(payload.type).toBe('textbox');
      expect(payload.text).toBe('新建文本');

      expect(ev.preventDefault).toHaveBeenCalled();
      expect(plugin.cache).toBe(tb);
      expect(plugin.lastCopyText).toBe('新建文本');
      expect(plugin._externalCopy).toBe(false);
    });

    it('编辑态（TEXTAREA 焦点）：不写剪贴板，保留原生复制并使哨兵失效', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('editing', { left: 0, top: 0, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);

      setFocus({ tagName: 'TEXTAREA' });
      const ev = fakeCopyEvent();
      plugin.copyListener(ev);
      setFocus(document.body);

      expect(ev.clipboardData.setData).not.toHaveBeenCalled();
      expect(ev.preventDefault).not.toHaveBeenCalled();
      expect(plugin._externalCopy).toBe(true);
    });

    it('输入框（INPUT 焦点）复制：同样使哨兵失效', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      setFocus({ tagName: 'INPUT' });
      const ev = fakeCopyEvent();
      plugin.copyListener(ev);
      setFocus(document.body);
      expect(ev.clipboardData.setData).not.toHaveBeenCalled();
      expect(plugin._externalCopy).toBe(true);
    });

    it('body 焦点但无激活对象：不干预', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const ev = fakeCopyEvent();
      plugin.copyListener(ev);
      expect(ev.clipboardData.setData).not.toHaveBeenCalled();
      expect(ev.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('粘贴：MIME 快照路径', () => {
    it('克隆一份，ctrl+v 的 setTimeout 兜底不重复克隆', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('payload', { left: 50, top: 50, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);
      const payload = JSON.stringify(tb.toObject([]));

      jest.useFakeTimers();
      // 模拟 ctrl+v 完整时序：keydown（排兜底定时器）→ paste 事件（快照克隆）
      plugin.hotkeyEvent('ctrl+v', { type: 'keydown' });
      const ev = dispatchPaste(plugin, { mime: payload });
      jest.runAllTimers();

      expect(ev.preventDefault).toHaveBeenCalled();
      expect(plugin.cache).toBeNull();
      // 原对象 + 恰好一个克隆
      expect(canvas.getObjects().length).toBe(2);
      jest.useRealTimers();
    });

    it('连续粘贴：每次各克隆一份', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('multi', { left: 50, top: 50, width: 200 });
      canvas.add(tb);
      const payload = JSON.stringify(tb.toObject([]));

      dispatchPaste(plugin, { mime: payload });
      dispatchPaste(plugin, { mime: payload });
      expect(canvas.getObjects().length).toBe(3);
    });
  });

  describe('粘贴：哨兵路径（MIME 丢失）', () => {
    it('text/plain 与复制时一致：克隆一次且不重复', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('sentinel', { left: 0, top: 0, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);
      plugin.cache = tb;
      plugin.lastCopyText = 'sentinel';

      jest.useFakeTimers();
      plugin.hotkeyEvent('ctrl+v', { type: 'keydown' });
      dispatchPaste(plugin, { text: 'sentinel' });
      jest.runAllTimers();

      // 原对象 + 恰好一个克隆；cache 保留支持连续粘贴
      expect(canvas.getObjects().length).toBe(2);
      expect(plugin.cache).toBe(tb);
      jest.useRealTimers();
    });

    it('连续哨兵粘贴：每次各克隆一份', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('dup', { left: 0, top: 0, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);
      plugin.cache = tb;
      plugin.lastCopyText = 'dup';

      dispatchPaste(plugin, { text: 'dup' });
      dispatchPaste(plugin, { text: 'dup' });
      expect(canvas.getObjects().length).toBe(3);
    });

    it('输入框复制后哨兵失效：同文本粘贴走外部插入', (done) => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('hello', { left: 0, top: 0, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);
      tb.selectionStart = 5;
      tb.selectionEnd = 5;
      plugin.cache = tb;
      plugin.lastCopyText = 'hello';

      // 模拟用户在页面输入框内复制了 "hello"（原生复制），哨兵应失效
      setFocus({ tagName: 'INPUT' });
      plugin.copyListener(fakeCopyEvent());
      setFocus(document.body);
      expect(plugin._externalCopy).toBe(true);

      const items = [{ kind: 'string', type: 'text/plain', getAsString: (cb) => cb('hello') }];
      dispatchPaste(plugin, { text: 'hello', items });

      setTimeout(() => {
        // 外部插入而非克隆
        expect(tb.text).toBe('hellohello');
        expect(canvas.getObjects().length).toBe(1);
        done();
      }, 0);
    });
  });

  describe('粘贴：外部内容', () => {
    it('插入激活文本框光标处，cache 清空', (done) => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('hello', { left: 0, top: 0, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);
      tb.selectionStart = 5;
      tb.selectionEnd = 5;
      plugin.cache = tb;

      const items = [{ kind: 'string', type: 'text/plain', getAsString: (cb) => cb(' world') }];
      const ev = dispatchPaste(plugin, { text: ' world', items });

      setTimeout(() => {
        expect(ev.preventDefault).toHaveBeenCalled();
        expect(tb.text).toBe('hello world');
        expect(tb.selectionStart).toBe(11);
        expect(plugin.cache).toBeNull();
        done();
      }, 0);
    });

    it('无激活文本框时新建 IText 元素', (done) => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const items = [{ kind: 'string', type: 'text/plain', getAsString: (cb) => cb('new text') }];
      const ev = dispatchPaste(plugin, { text: 'new text', items });

      setTimeout(() => {
        expect(ev.preventDefault).toHaveBeenCalled();
        const added = canvas.getObjects().find((o) => o.type === 'i-text');
        expect(added).toBeTruthy();
        expect(added.text).toBe('new text');
        done();
      }, 0);
    });
  });

  describe('快捷键兜底', () => {
    it('ctrl+c 仅暂存 cache；无 paste 事件时 ctrl+v 经 setTimeout 克隆一次', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      const tb = new fabric.Textbox('fallback', { left: 100, top: 100, width: 200 });
      canvas.add(tb);
      canvas.setActiveObject(tb);

      plugin.hotkeyEvent('ctrl+c', { type: 'keydown' });
      expect(plugin.cache).toBe(tb);

      jest.useFakeTimers();
      plugin.hotkeyEvent('ctrl+v', { type: 'keydown' });
      jest.runAllTimers();
      expect(canvas.getObjects().length).toBe(2);
      jest.useRealTimers();
    });

    it('ctrl+v 无 cache 时不崩溃', () => {
      const canvas = createCanvas();
      const plugin = createPlugin(canvas, createEditor());
      jest.useFakeTimers();
      plugin.cache = null;
      expect(() => {
        plugin.hotkeyEvent('ctrl+v', { type: 'keydown' });
      }).not.toThrow();
      jest.runAllTimers();
      jest.useRealTimers();
    });

    it('destroy 正确解绑 copy/paste 监听', () => {
      const docRemoveSpy = jest.spyOn(document, 'removeEventListener');
      const winRemoveSpy = jest.spyOn(window, 'removeEventListener');
      const canvas = createCanvas();
      const plugin = new CopyPlugin(canvas, createEditor());
      plugin.destroy();
      expect(docRemoveSpy).toHaveBeenCalledWith('copy', plugin._onCopy);
      expect(winRemoveSpy).toHaveBeenCalledWith('paste', plugin._onPaste);
      docRemoveSpy.mockRestore();
      winRemoveSpy.mockRestore();
    });
  });
});
