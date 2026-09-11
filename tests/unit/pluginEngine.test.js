/**
 * PluginEngine 基类：插件容器 + hooks 契约（Editor 与 RendererCore 共用）
 */
jest.mock('../../src/core/styles/contextMenu.css', () => ({}), { virtual: true });
jest.mock('../../src/core/styles/resizePlugin.css', () => ({}), { virtual: true });
jest.mock('../../src/core/generators', () => ({
  generateQrCodeDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,FAKEQR')),
  generateBarcodeDataURL: jest.fn(() => 'data:image/png;base64,FAKEBAR'),
  qrParamsToOption: (o) => o,
}));

import PluginEngine from '../../src/core/PluginEngine';
import Editor from '../../src/core/Editor';
import RendererCore from '../../src/core/RendererCore';
import { PLUGIN_HOOKS } from '../../src/core/plugin/BindPluginHooks';

// 极小测试插件：仅含一个 hookTransform，验证绑定与调用
class TestPlugin {
  constructor(canvas, editor, options) {
    this.canvas = canvas;
    this.editor = editor;
    this.options = options;
  }
  hookTransform(obj) {
    obj._tapped = (obj._tapped || 0) + 1;
    return Promise.resolve();
  }
}
TestPlugin.pluginName = 'TestPlugin';
TestPlugin.apis = ['tapApi'];

describe('PluginEngine 插件容器与 hooks 契约', () => {
  it('_initHooks 创建 PLUGIN_HOOKS 同名 AsyncSeriesHook', () => {
    const engine = new PluginEngine();
    engine._initHooks();
    PLUGIN_HOOKS.forEach((h) => {
      expect(typeof engine.hooksEntity[h].tapPromise).toBe('function');
    });
    expect(engine.hooks).toEqual(PLUGIN_HOOKS);
  });

  it('_bindPlugin + getPlugin + hookTransform 绑定生效', (done) => {
    const engine = new PluginEngine();
    engine.canvas = {};
    engine._initHooks();
    const instance = engine._bindPlugin(TestPlugin, { foo: 1 });
    expect(instance).toBeInstanceOf(TestPlugin);
    expect(instance.options.foo).toBe(1);
    expect(engine.getPlugin('TestPlugin')).toBe(instance);
    const target = {};
    engine.hooksEntity.hookTransform.callAsync(target, () => {
      expect(target._tapped).toBe(1);
      done();
    });
  });

  it('destroy 清理 pluginMap 与 hooksEntity', () => {
    const engine = new PluginEngine();
    engine._initHooks();
    engine._bindPlugin(TestPlugin, {});
    expect(engine.getPlugin('TestPlugin')).toBeTruthy();
    engine.destroy();
    expect(engine.getPlugin('TestPlugin')).toBeNull();
    expect(engine.hooksEntity).toEqual({});
  });

  it('Editor 与 RendererCore 均继承 PluginEngine', () => {
    expect(new Editor() instanceof PluginEngine).toBe(true);
    // RendererCore 需要 canvas，用最小占位验证原型链
    expect(RendererCore.prototype instanceof PluginEngine).toBe(true);
  });
});
