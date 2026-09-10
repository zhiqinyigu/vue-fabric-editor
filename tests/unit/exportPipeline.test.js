/**
 * ServersPlugin 导出管线双模式回归
 * - getJson() 默认最小化：缺省字段精简 + variableMeta 精简态（C 端 defaultValue 回退项）
 * - getJson(true) 完整：不精简 + variableMeta 全量快照（schema 定义 + 测试数据 + src 标记）
 * - saveJson()：完整导出 + 2 空格缩进
 * - clipboard()：最小化导出 + 紧凑 JSON
 * - 变量背景（tile）：最小化导出顶替 fill.source 为变量 URL；完整导出保留占位 base64（D8）
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
import { downFile } from '../../src/core/utils/utils';

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

// 注入会话表（视为导入）：
// - user.name：画布已用 + 有 defaultValue → 两种形态均携带
// - user.age：画布已用 + 无 defaultValue → 精简态过滤
// - banner.img：未使用 + 有 defaultValue → 精简态过滤（全量快照仍携带）
function setupSchema(vp) {
  vp.setVariableSchema([
    { path: 'user.name', label: '用户名', type: 'text', defaultValue: '默认名' },
    { path: 'user.age', label: '年龄', type: 'text' },
    {
      path: 'banner.img',
      label: '横幅',
      type: 'image',
      defaultValue: 'https://cdn.example.com/b.png',
    },
  ]);
}

describe('ServersPlugin 导出管线双模式', () => {
  it('getJson() 默认最小化：缺省字段精简 + variableMeta 精简态（仅 defaultValue 回退项）', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    setupSchema(vp);
    const json = plugin.getJson();

    // 缺省字段被剔除（textbox 的 scaleX/opacity 等于默认值）
    const tb = json.objects.find((o) => o.type === 'textbox');
    expect(tb).toBeTruthy();
    expect('scaleX' in tb).toBe(false);
    expect('opacity' in tb).toBe(false);

    // 精简态：仅「已使用 ∧ 非空 defaultValue」条目，无测试数据、无旧 variables
    const meta = json.variableMeta;
    expect(meta.version).toBe(1);
    expect(meta.delimiter).toEqual({ start: '{{', end: '}}' });
    expect(meta.schema).toEqual([{ path: 'user.name', defaultValue: '默认名' }]);
    expect('variables' in meta).toBe(false);
  });

  it('getJson(true) 完整：全量快照（定义 + 测试数据 + src 标记）+ 缺省字段保留', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    setupSchema(vp);
    const json = plugin.getJson(true);

    // 完整导出不剔除缺省字段
    const tb = json.objects.find((o) => o.type === 'textbox');
    expect(tb.scaleX).toBe(1);
    expect(tb.opacity).toBe(1);

    const meta = json.variableMeta;
    expect(meta.version).toBe(1);
    // 全量快照（B）：三个定义全部携带，与是否使用无关
    expect(meta.schema).toHaveLength(3);
    // example 承载测试数据（testData 已填值权威），src 按导入/自定义标记
    expect(meta.schema.find((d) => d.path === 'user.name')).toEqual({
      path: 'user.name',
      label: '用户名',
      type: 'text',
      example: '张三',
      defaultValue: '默认名',
      description: '',
      src: 'imported',
    });
    expect(meta.schema.find((d) => d.path === 'banner.img')).toMatchObject({
      path: 'banner.img',
      src: 'imported',
    });
  });

  it('getJson(true) 未定义变量合成 def：label=path、类型按占位字段推断、example 取测试数据', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    const json = plugin.getJson(true);
    expect(json.variableMeta.schema).toEqual([
      {
        path: 'user.name',
        label: 'user.name',
        type: 'text',
        example: '张三',
        defaultValue: '',
        description: '',
        src: 'custom',
      },
    ]);
  });

  it('clipboard() 走最小化路径：与 getJson() 同构', async () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    setupSchema(vp);
    await plugin.clipboard();

    const min = plugin.getJson();
    expect(min.variableMeta.schema).toEqual([{ path: 'user.name', defaultValue: '默认名' }]);
    const tbMin = min.objects.find((o) => o.type === 'textbox');
    expect('scaleX' in tbMin).toBe(false);
  });

  it('saveJson() 走完整路径 + 2 空格缩进', async () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    setupSchema(vp);

    const stringifySpy = jest.spyOn(JSON, 'stringify');
    await plugin.saveJson();

    const firstCall = stringifySpy.mock.calls[0];
    expect(firstCall[1]).toBeNull();
    expect(firstCall[2]).toBe(2);

    const dataUrl = firstCall[0];
    expect(dataUrl.variableMeta.schema.find((d) => d.path === 'user.name').example).toBe('张三');

    stringifySpy.mockRestore();
  });

  it('最小化导出经 normalizeCanvasDefaults 补回缺省字段，variableMeta 精简态原样保留', () => {
    const { canvas, plugin, vp } = createEditor();
    addVariableTextbox(canvas, vp);
    setupSchema(vp);
    const min = plugin.getJson();

    const restored = normalizeCanvasDefaults(JSON.parse(JSON.stringify(min)));
    const tb = restored.objects.find((o) => o.type === 'textbox');
    expect(tb.scaleX).toBe(1);
    expect(tb.opacity).toBe(1);
    expect(restored.variableMeta.schema).toEqual([{ path: 'user.name', defaultValue: '默认名' }]);
  });
});

describe('ServersPlugin 变量背景（tile）序列化顶替策略（D8）', () => {
  const PLACEHOLDER_BG = 'data:image/png;base64,PLACEHOLDERBG';
  // 模拟编辑期占位图元素：Pattern source 是占位图 base64（fabric Pattern.toObject 取其 .src）
  function makePlaceholderEl() {
    const el = document.createElement('img');
    Object.defineProperty(el, 'src', { value: PLACEHOLDER_BG, configurable: true });
    return el;
  }
  // 构造编辑期 tile 变量背景：src 为变量 URL，fill.source 是占位图 Pattern
  function addVariableTileBackground(canvas) {
    const bg = new fabric.Rect({
      id: 'backgroundImage',
      left: 0,
      top: 0,
      width: 300,
      height: 400,
      backgroundImageMode: 'tile',
      isVariableBackground: true,
      src: '{{user.bg}}',
      fill: new fabric.Pattern({ source: makePlaceholderEl(), repeat: 'repeat' }),
    });
    canvas.add(bg);
    return bg;
  }

  it('getJson() 最小化导出：fill.source 顶替为变量 URL，JSON 无占位 base64', () => {
    const { canvas, plugin } = createEditor();
    addVariableTileBackground(canvas);
    const json = plugin.getJson();
    const bg = json.objects.find((o) => o.id === 'backgroundImage');
    expect(bg).toBeTruthy();
    expect(bg.isVariableBackground).toBe(true); // getExtensionKey 已登记
    expect(bg.src).toBe('{{user.bg}}'); // Rect 形态的 src 依赖扩展键登记
    expect(bg.fill.source).toBe('{{user.bg}}'); // Pattern 仅为派生渲染结果
    expect(JSON.stringify(json)).not.toContain('PLACEHOLDERBG'); // 无占位 base64
  });

  it('getJson(true) 完整导出（saveJson 下载）：不做顶替，保留占位图 base64（D8，预期）', () => {
    // 设计约定 D8（plans/variable-bg.md）：完整导出是编辑器自包含形态，不做变量 URL 顶替，
    // 重新导入即由 WorkspacePlugin/VariablePlugin 还原占位；仅最小化导出（上一条用例）顶替。
    const { canvas, plugin } = createEditor();
    addVariableTileBackground(canvas);
    const full = plugin.getJson(true);
    const bg = full.objects.find((o) => o.id === 'backgroundImage');
    expect(bg.src).toBe('{{user.bg}}'); // 变量 URL 仍在 src（唯一事实来源）
    expect(String(bg.fill.source)).toContain('PLACEHOLDERBG'); // fill.source 保留占位图
  });
});

describe('ServersPlugin 导出兜底（tainted canvas）', () => {
  function makeTaintedError() {
    const err = new Error('Tainted canvases may not be exported.');
    err.name = 'SecurityError';
    return err;
  }

  it('preview 遇到 SecurityError：resolve(null) + emit save:error（code=CANVAS_TAINTED）', async () => {
    const { canvas, editor, plugin } = createEditor();
    const events = [];
    editor.emit = (name, payload) => events.push({ name, payload });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const optionSpy = jest.spyOn(plugin, '_getSaveOption').mockReturnValue({});
    const toDataURLSpy = jest.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      throw makeTaintedError();
    });

    const dataUrl = await plugin.preview(1);
    expect(dataUrl).toBeNull();
    const evt = events.find((e) => e.name === 'save:error');
    expect(evt).toBeTruthy();
    expect(evt.payload.code).toBe('CANVAS_TAINTED');

    errSpy.mockRestore();
    optionSpy.mockRestore();
    toDataURLSpy.mockRestore();
  });

  it('saveImg 遇到 SecurityError：emit save:error 且不触发下载', () => {
    const { canvas, editor, plugin } = createEditor();
    const events = [];
    editor.emit = (name, payload) => events.push({ name, payload });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const optionSpy = jest.spyOn(plugin, '_getSaveOption').mockReturnValue({});
    const toDataURLSpy = jest.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      throw makeTaintedError();
    });
    downFile.mockClear();

    plugin.saveImg(1);
    expect(events.some((e) => e.name === 'save:error')).toBe(true);
    expect(downFile).not.toHaveBeenCalled();

    errSpy.mockRestore();
    optionSpy.mockRestore();
    toDataURLSpy.mockRestore();
  });

  it('_toDataURLSafe 对非污染错误原样抛出（不伪装成跨域错误）', () => {
    const { canvas, plugin } = createEditor();
    const toDataURLSpy = jest.spyOn(canvas, 'toDataURL').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => plugin._toDataURLSafe({})).toThrow('boom');
    toDataURLSpy.mockRestore();
  });
});
