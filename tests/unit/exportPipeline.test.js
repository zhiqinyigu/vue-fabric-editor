/**
 * ServersPlugin 导出管线双模式回归
 * - getJson() 默认最小化：缺省字段精简 + 剔除 variableMeta.variables[].example
 * - getJson(true) 完整：不精简、保留 example
 * - saveJson()：完整导出 + 2 空格缩进
 * - clipboard()：最小化导出 + 紧凑 JSON
 */
import { fabric } from 'fabric';
import '../../src/core/objects/CustomTextbox';

jest.mock('../../src/core/utils/utils', () => ({
  selectFiles: jest.fn(),
  clipboardText: jest.fn(() => Promise.resolve()),
  downFile: jest.fn(),
}));

import ServersPlugin from '../../src/core/ServersPlugin';
import VariablePlugin from '../../src/core/plugin/VariablePlugin';
import { normalizeCanvasDefaults } from '../../src/core/jsonOptimizer';

function createEditor() {
  const el = document.createElement('canvas');
  el.width = 300;
  el.height = 400;
  document.body.appendChild(el);
  const canvas = new fabric.Canvas(el, { selection: false, skipTargetFind: true });
  const hooksEntity = {
    hookImportBefore: { callAsync: (_d, cb) => cb && cb() },
    hookImportAfter: { callAsync: (_d, cb) => cb && cb() },
    hookTransform: { callAsync: (_d, cb) => cb && cb() },
    hookSaveBefore: { callAsync: (_d, cb) => cb && cb() },
    hookSaveAfter: { callAsync: (_d, cb) => cb && cb() },
  };
  const editor = {
    options: {},
    hooksEntity,
    emit: () => {},
    getPlugin: () => null,
    updateDrawStatus: () => {},
  };
  const plugin = new ServersPlugin(canvas, editor);
  const vp = new VariablePlugin(canvas, editor);
  editor.getPlugin = (name) => (name === 'VariablePlugin' ? vp : null);
  return { canvas, editor, plugin, vp };
}

function addVariableTextbox(canvas, vp, text = '{{user.name}}') {
  const tb = new fabric.Textbox(text, {
    left: 0,
    top: 0,
    width: 200,
    height: 40,
    fill: '#000000',
  });
  canvas.add(tb);
  vp.setTestData({ 'user.name': '张三' });
  return tb;
}

describe('ServersPlugin 导出管线双模式', () => {
  it('getJson() 默认最小化：剔除缺省字段与 variableMeta.example', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    const json = plugin.getJson();

    // 缺省字段被剔除（textbox 的 scaleX/opacity 等于默认值）
    const tb = json.objects.find((o) => o.type === 'textbox');
    expect(tb).toBeTruthy();
    expect('scaleX' in tb).toBe(false);
    expect('opacity' in tb).toBe(false);

    // example 被剔除，path/name 保留
    expect(json.variableMeta).toBeTruthy();
    json.variableMeta.variables.forEach((v) => {
      expect('example' in v).toBe(false);
      expect(v.path).toBe('user.name');
      expect(v.name).toBe('user.name');
    });
  });

  it('getJson(true) 完整：保留缺省字段与 example', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    const json = plugin.getJson(true);

    // 完整导出不剔除缺省字段
    const tb = json.objects.find((o) => o.type === 'textbox');
    expect(tb.scaleX).toBe(1);
    expect(tb.opacity).toBe(1);

    // example 保留
    expect(json.variableMeta.variables[0].example).toBe('张三');
  });

  it('clipboard() 走最小化路径：example 与缺省字段均剔除', async () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    await plugin.clipboard();

    // clipboard 内部调 getJson()，验证同 getJson() 结果
    const min = plugin.getJson();
    expect('example' in min.variableMeta.variables[0]).toBe(false);
    const tbMin = min.objects.find((o) => o.type === 'textbox');
    expect('scaleX' in tbMin).toBe(false);
  });

  it('saveJson() 走完整路径 + 2 空格缩进', async () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);

    const stringifySpy = jest.spyOn(JSON, 'stringify');
    await plugin.saveJson();

    const firstCall = stringifySpy.mock.calls[0];
    expect(firstCall[1]).toBeNull();
    expect(firstCall[2]).toBe(2);

    const dataUrl = firstCall[0];
    expect(dataUrl.variableMeta.variables[0].example).toBe('张三');

    stringifySpy.mockRestore();
  });

  it('最小化导出经 normalizeCanvasDefaults 补回缺省字段', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    const min = plugin.getJson();

    const restored = normalizeCanvasDefaults(JSON.parse(JSON.stringify(min)));
    const tb = restored.objects.find((o) => o.type === 'textbox');
    expect(tb.scaleX).toBe(1);
    expect(tb.opacity).toBe(1);
    // example 已永久剔除，不会补回（符合预期）
    expect('example' in restored.variableMeta.variables[0]).toBe(false);
  });
});
