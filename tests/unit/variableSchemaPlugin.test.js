/**
 * VariablePlugin 变量表（schema）扩展测试
 * 1) 注入/拉取：setVariableSchema、ensureSchemaLoaded（每次拉取最新、并发合并、失败重试）
 * 2) 自定义变量 CRUD：add/update/remove（导入只读、path 不可改、查重）
 * 3) 保存与导出：saveVariableSchema / exportVariableSchema
 * 4) 画布扫描：getVariableEntries（含 group 递归与多字段聚合）
 * 5) 预览联动：enterPreview 默认值补齐（扁平映射表语义）、预览中 schema 变更重刷
 */
import { fabric } from 'fabric';
import VariablePlugin from '../../src/core/plugin/VariablePlugin';

function makeTextbox(text) {
  return {
    type: 'textbox',
    text,
    set(...args) {
      if (args.length === 2) {
        this[args[0]] = args[1];
        return;
      }
      Object.assign(this, args[0]);
    },
    initDimensions() {},
    setCoords() {},
  };
}

function makeGroup(children) {
  return { type: 'group', objects: children };
}

function makeCanvas(objs) {
  return {
    on: () => {},
    off: () => {},
    getObjects: () => objs,
    requestRenderAll: () => {},
    discardActiveObject: () => {},
    selection: true,
    skipTargetFind: false,
    defaultCursor: 'default',
  };
}

function makeEditor() {
  const events = [];
  return {
    events,
    emit: (name, payload) => events.push({ name, payload }),
    getPlugin: () => null,
  };
}

function emitted(events, name) {
  return events.filter((e) => e.name === name);
}

describe('VariablePlugin.setVariableSchema：注入与导入标记', () => {
  it('规范化、去重并标记导入（只读）', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    const defs = p.setVariableSchema([
      { path: ' course.name ', label: '课程名称', type: 'text' },
      { path: 'course.name', label: '重复被忽略', type: 'image' },
      { path: '  ', label: '非法' },
    ]);
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ path: 'course.name', label: '课程名称' });
    expect(p.isImportedVariable('course.name')).toBe(true);
  });

  it('getVariableSchema 返回深拷贝，外部改写不污染内部状态', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: 'x' }]);
    const snap = p.getVariableSchema();
    snap[0].label = '被改写';
    expect(p.getVariableSchema()[0].label).toBe('x');
  });

  it('覆盖注入时保留会话内自定义变量；同 path 导入为权威', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    return p.addCustomVariable({ path: 'custom.v', label: '自定义' }).then(() =>
      p.addCustomVariable({ path: 'c.d', label: '将被覆盖' }).then(() => {
        const defs = p.setVariableSchema([{ path: 'c.d', label: '导入版' }]);
        const paths = defs.map((d) => d.path);
        expect(paths).toContain('custom.v');
        expect(paths).toContain('c.d');
        expect(defs.find((d) => d.path === 'c.d').label).toBe('导入版');
        expect(p.isImportedVariable('c.d')).toBe(true);
        expect(p.isImportedVariable('custom.v')).toBe(false);
      })
    );
  });

  it('注入后广播 variable:schemaChange', () => {
    const editor = makeEditor();
    const p = new VariablePlugin(makeCanvas([]), editor);
    p.setVariableSchema([{ path: 'a.b', label: 'x' }]);
    const changes = emitted(editor.events, 'variable:schemaChange');
    expect(changes).toHaveLength(1);
    expect(changes[0].payload).toEqual([
      { path: 'a.b', label: 'x', type: 'text', example: '', defaultValue: '', description: '' },
    ]);
  });
});

describe('VariablePlugin 自定义变量 CRUD', () => {
  it('addCustomVariable：合法新增并广播；非法（重复/空 path/含包裹符）拒绝', async () => {
    const editor = makeEditor();
    const p = new VariablePlugin(makeCanvas([]), editor);
    p.setVariableSchema([{ path: 'a.b', label: '导入' }]);

    await p.addCustomVariable({ path: 'x.y', label: '新增' });
    expect(p.getVariableSchema().map((d) => d.path)).toContain('x.y');
    expect(p.isImportedVariable('x.y')).toBe(false);
    expect(emitted(editor.events, 'variable:schemaChange')).toHaveLength(2);

    await expect(p.addCustomVariable({ path: 'x.y', label: '重复' })).rejects.toMatchObject({
      code: 'invalid_variable_def',
    });
    await expect(p.addCustomVariable({ path: 'a.b', label: '撞导入' })).rejects.toMatchObject({
      code: 'invalid_variable_def',
    });
    await expect(p.addCustomVariable({ path: '', label: 'x' })).rejects.toMatchObject({
      code: 'invalid_variable_def',
    });
    await expect(p.addCustomVariable({ path: '{{a}}', label: 'x' })).rejects.toMatchObject({
      code: 'invalid_variable_def',
    });
  });

  it('updateCustomVariable：可更新字段；path 不可改；导入可编辑；不存在拒绝', async () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: '导入' }]);
    await p.addCustomVariable({ path: 'x.y', label: '旧名', type: 'text' });

    await p.updateCustomVariable('x.y', { label: '新名', defaultValue: '默认值' });
    const custom = p.getVariableSchema().find((d) => d.path === 'x.y');
    expect(custom.label).toBe('新名');
    expect(custom.defaultValue).toBe('默认值');

    // patch 试图改 path：不生效（path 为画布占位符锚点）
    await p.updateCustomVariable('x.y', { path: 'other.v' });
    expect(p.getVariableSchema().map((d) => d.path)).toContain('x.y');

    // 导入变量可编辑（仅删除受限），来源标记不变
    await p.updateCustomVariable('a.b', { label: '改导入' });
    const imported = p.getVariableSchema().find((d) => d.path === 'a.b');
    expect(imported.label).toBe('改导入');
    expect(p.isImportedVariable('a.b')).toBe(true);

    await expect(p.updateCustomVariable('no.v', { label: 'x' })).rejects.toMatchObject({
      code: 'variable_not_found',
    });
  });

  it('removeCustomVariable：可删自定义；导入不可删除', async () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: '导入' }]);
    await p.addCustomVariable({ path: 'x.y', label: '自定义' });

    await p.removeCustomVariable('x.y');
    expect(p.getVariableSchema().map((d) => d.path)).not.toContain('x.y');
    await expect(p.removeCustomVariable('a.b')).rejects.toMatchObject({
      code: 'imported_readonly',
    });
  });

  it('开发者后门 setSchemaEditable：解锁后可删导入变量，关闭恢复只读（可逆）+ 广播驱动 UI', async () => {
    const editor = makeEditor();
    const p = new VariablePlugin(makeCanvas([]), editor);
    p.setVariableSchema([{ path: 'a.b', label: '导入' }]);
    expect(p.isSchemaEditable()).toBe(false);
    expect(p.isImportedVariable('a.b')).toBe(true);

    // 解锁：imported 视为可编辑、删除放行，且广播一次（UI 删除按钮据此显隐）
    const before = emitted(editor.events, 'variable:schemaChange').length;
    p.setSchemaEditable(true);
    expect(p.isSchemaEditable()).toBe(true);
    expect(emitted(editor.events, 'variable:schemaChange').length).toBe(before + 1);
    expect(p.isImportedVariable('a.b')).toBe(false);
    await p.removeCustomVariable('a.b');
    expect(p.getVariableSchema().map((d) => d.path)).not.toContain('a.b');

    // 关闭：重新注入同 path 后只读恢复（_schemaImportedPaths 未被后门破坏，可逆）
    p.setSchemaEditable(false);
    expect(p.isSchemaEditable()).toBe(false);
    p.setVariableSchema([{ path: 'a.b', label: '导入' }]);
    expect(p.isImportedVariable('a.b')).toBe(true);
    await expect(p.removeCustomVariable('a.b')).rejects.toMatchObject({
      code: 'imported_readonly',
    });
  });
});

describe('VariablePlugin.ensureSchemaLoaded：每次拉取最新（多人协同）', () => {
  it('有 adapter 时拉取 list 并标记导入；同刻并发调用合并为一次请求（in-flight 去重）', async () => {
    const list = jest.fn(() =>
      Promise.resolve([
        { path: 'a.b', label: '导入A' },
        { path: 'c.d', label: '导入C' },
      ])
    );
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setSchemaAdapter({ list });

    await p.addCustomVariable({ path: 'custom.v', label: '自定义' });
    const [r1, r2] = await Promise.all([p.ensureSchemaLoaded(), p.ensureSchemaLoaded()]);
    expect(list).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
    const paths = p.getVariableSchema().map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['a.b', 'c.d', 'custom.v']));
    expect(p.isImportedVariable('a.b')).toBe(true);
    expect(p.isImportedVariable('custom.v')).toBe(false);
  });

  it('已加载后再次调用重新拉取（不幂等）：后台为权威（删除的移除、新增的进入），会话内自定义变量保留', async () => {
    let defs = [{ path: 'a.b', label: '导入A' }];
    const list = jest.fn(() => Promise.resolve(defs));
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setSchemaAdapter({ list });

    await p.ensureSchemaLoaded();
    await p.addCustomVariable({ path: 'custom.v', label: '自定义' });

    // 后台删除 a.b、新增 e.f → 重拉后会话表 = e.f + 会话内 custom.v，a.b 被移除
    defs = [{ path: 'e.f', label: '导入E' }];
    await p.ensureSchemaLoaded();
    expect(list).toHaveBeenCalledTimes(2);
    const paths = p.getVariableSchema().map((d) => d.path);
    expect(paths).toContain('e.f');
    expect(paths).toContain('custom.v');
    expect(paths).not.toContain('a.b');
  });

  it('list 失败 reject 且可重试；更换 adapter 重置加载状态', async () => {
    const list = jest.fn(() => Promise.reject(new Error('network error')));
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setSchemaAdapter({ list });

    await expect(p.ensureSchemaLoaded()).rejects.toThrow('network error');
    await expect(p.ensureSchemaLoaded()).rejects.toThrow('network error');
    expect(list).toHaveBeenCalledTimes(2);

    // 更换 adapter 后重新拉取成功
    p.setSchemaAdapter({ list: () => Promise.resolve([{ path: 'a.b', label: 'ok' }]) });
    const defs = await p.ensureSchemaLoaded();
    expect(defs.map((d) => d.path)).toEqual(['a.b']);
  });

  it('无 adapter / 未实现 list：返回当前会话表不抛错', async () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: 'x' }]);
    const normalized = {
      path: 'a.b',
      label: 'x',
      type: 'text',
      example: '',
      defaultValue: '',
      description: '',
    };
    await expect(p.ensureSchemaLoaded()).resolves.toEqual([normalized]);
    p.setSchemaAdapter({});
    await expect(p.ensureSchemaLoaded()).resolves.toEqual([normalized]);
  });
});

describe('VariablePlugin 保存与导出', () => {
  it('saveVariableSchema：有 save 时全量保存；无 save 时拒绝', async () => {
    const save = jest.fn(() => Promise.resolve());
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setSchemaAdapter({ list: () => Promise.resolve([{ path: 'a.b', label: '导入' }]), save });
    await p.ensureSchemaLoaded();
    await p.addCustomVariable({ path: 'x.y', label: '自定义' });

    const defs = await p.saveVariableSchema();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].map((d) => d.path)).toEqual(['a.b', 'x.y']);
    expect(defs.map((d) => d.path)).toEqual(['a.b', 'x.y']);
  });

  it('无 adapter.save：reject 且不崩溃', async () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: 'x' }]);
    await expect(p.saveVariableSchema()).rejects.toMatchObject({
      code: 'save_not_implemented',
    });
  });

  it('exportVariableSchema：输出可解析 JSON', async () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: 'x', defaultValue: 'd' }]);
    const parsed = JSON.parse(p.exportVariableSchema());
    expect(parsed).toEqual([
      {
        path: 'a.b',
        label: 'x',
        type: 'text',
        example: '',
        defaultValue: 'd',
        description: '',
      },
    ]);
  });
});

describe('VariablePlugin.getVariableEntries：画布扫描', () => {
  it('收集 path + 聚合占位字段（含 group 递归与二维码扩展字段）', () => {
    const objs = [
      makeGroup([makeTextbox('名称：{{user.name}}')]),
      makeTextbox('{{user.name}} 与 {{order.code}}'),
      { type: 'image', src: 'https://cdn.example.com/{{user.avatar}}' },
      {
        type: 'image',
        extensionType: 'qrcode',
        extension: { data: 'https://x.com/{{user.id}}' },
      },
    ];
    const p = new VariablePlugin(makeCanvas(objs), makeEditor());
    const entries = p.getVariableEntries();
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e.fields]));
    expect(byPath['user.name']).toEqual(['text']);
    expect(byPath['order.code']).toEqual(['text']);
    expect(byPath['user.avatar']).toEqual(['src']);
    expect(byPath['user.id']).toEqual(['extension.data']);
  });
});

describe('VariablePlugin 预览与变量表联动', () => {
  it('enterPreview：默认值补齐 testData（扁平映射表语义），已填值不覆盖', () => {
    const tb = makeTextbox('名称：{{a.b}}');
    const editor = makeEditor();
    const p = new VariablePlugin(makeCanvas([tb]), editor);
    p.setVariableSchema([
      { path: 'a.b', label: '变量A', defaultValue: '默认A' },
      { path: 'b.c', label: '变量B' },
    ]);
    p.setTestData({ 'a.b': '已有值' });

    p.enterPreview();
    // 扁平 key 写入（不引入嵌套结构）；已填值权威；无默认值的变量不写入
    expect(p.getTestData()).toEqual({ 'a.b': '已有值' });
    expect(tb.text).toBe('名称：已有值');
    expect(emitted(editor.events, 'variable:testDataChange').length).toBeGreaterThan(0);
  });

  it('enterPreview：缺失 key 补默认值并渲染', () => {
    const tb = makeTextbox('名称：{{a.b}}');
    const p = new VariablePlugin(makeCanvas([tb]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: '变量A', defaultValue: '默认A' }]);
    p.enterPreview();
    expect(p.getTestData()['a.b']).toBe('默认A');
    expect(tb.text).toBe('名称：默认A');
    p.exitPreview();
    expect(tb.text).toBe('名称：{{a.b}}');
  });

  it('预览中 schema 变更：已有默认值不覆盖，新增变量默认值生效并重刷', () => {
    const tb1 = makeTextbox('名称：{{a.b}}');
    const tb2 = makeTextbox('编号：{{n.v}}');
    const p = new VariablePlugin(makeCanvas([tb1, tb2]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: '变量A', defaultValue: '默认A' }]);
    p.enterPreview();
    expect(tb1.text).toBe('名称：默认A');
    expect(tb2.text).toBe('编号：'); // 无默认值且无测试数据 → 渲染空串

    // 预览态下更新变量表：新增变量默认值补齐并重刷；已合并的默认值不被覆盖
    p.setVariableSchema([
      { path: 'a.b', label: '变量A', defaultValue: '默认X' },
      { path: 'n.v', label: '变量N', defaultValue: '默认N' },
    ]);
    expect(tb1.text).toBe('名称：默认A');
    expect(tb2.text).toBe('编号：默认N');
    p.exitPreview();
    expect(tb1.text).toBe('名称：{{a.b}}');
    expect(tb2.text).toBe('编号：{{n.v}}');
  });
});

describe('VariablePlugin schema 注入的 example 预填', () => {
  it('setVariableSchema：缺失 key 按 example 预填 testData（扁平 key），已填值不覆盖', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setTestData({ 'a.b': '已填' });
    p.setVariableSchema([
      { path: 'a.b', label: 'A', example: '示例A' },
      { path: 'c.d', label: 'C', example: '示例C' },
      { path: 'e.f', label: 'E' },
    ]);
    // 扁平 key 写入；已填值权威；无 example 不写入
    expect(p.getTestData()).toEqual({ 'a.b': '已填', 'c.d': '示例C' });
  });

  it('ensureSchemaLoaded：adapter 拉取后同样预填并广播 testDataChange', async () => {
    const editor = makeEditor();
    const p = new VariablePlugin(makeCanvas([]), editor);
    p.setSchemaAdapter({
      list: () => Promise.resolve([{ path: 'a.b', label: 'A', example: '示例A' }]),
    });
    await p.ensureSchemaLoaded();
    expect(p.getTestData()['a.b']).toBe('示例A');
    expect(emitted(editor.events, 'variable:testDataChange').length).toBeGreaterThan(0);
  });

  it('自定义变量带 example：提交后同样预填（addCustomVariable）', async () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    await p.addCustomVariable({ path: 'x.y', label: 'X', example: '示例X' });
    expect(p.getTestData()['x.y']).toBe('示例X');
  });
});

describe('VariablePlugin variableMeta 快照与导入还原', () => {
  const TEXT_CANVAS = () => makeCanvas([makeTextbox('hello {{user.name}} world')]);

  it('getVariableMeta(true)：全量快照（src 标记 + example 承载测试数据 + 合成未定义变量）', () => {
    const p = new VariablePlugin(TEXT_CANVAS(), makeEditor());
    p.setTestData({ 'user.name': '张三', 'user.age': '' });
    p.setVariableSchema([{ path: 'user.age', label: '年龄', defaultValue: '18' }]);
    const meta = p.getVariableMeta(true);
    expect(meta.version).toBe(1);
    // 已定义：example = testData 空串权威（不回退业务预设）；导入态 src=imported
    // 合成：user.name 未定义 → label=path、src=custom（可编辑）
    expect(meta.schema).toEqual([
      {
        path: 'user.age',
        label: '年龄',
        type: 'text',
        example: '',
        defaultValue: '18',
        description: '',
        src: 'imported',
      },
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

  it('getVariableMeta(true)：testData 未填时 example 回退业务预设', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: 'A', example: '预设' }]);
    p.setTestData({}); // 清掉预填，模拟作者未碰过测试数据
    expect(p.getVariableMeta(true).schema[0].example).toBe('预设');
  });

  it('getVariableMeta(false)：精简态（已使用 ∧ 非空 defaultValue）', () => {
    const p = new VariablePlugin(TEXT_CANVAS(), makeEditor());
    p.setVariableSchema([
      { path: 'user.name', label: '用户名', defaultValue: '默认名' },
      { path: 'user.age', label: '年龄' },
      { path: 'banner.img', label: '横幅', defaultValue: 'x' },
    ]);
    expect(p.getVariableMeta(false)).toEqual({
      version: 1,
      delimiter: { start: '{{', end: '}}' },
      schema: [{ path: 'user.name', defaultValue: '默认名' }],
    });
  });

  it('hookImportBefore：新契约快照还原（包裹符 + src 权限 + example 预填）', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.hookImportBefore({
      variableMeta: {
        version: 1,
        delimiter: { start: '<%', end: '%>' },
        schema: [
          { path: 'a.b', label: 'A', type: 'text', example: '示例A', src: 'imported' },
          { path: 'x.y', label: 'X', type: 'image', example: '示例X', src: 'custom' },
        ],
      },
    });
    expect(p.getDelimiter()).toEqual({ start: '<%', end: '%>' });
    expect(p.isImportedVariable('a.b')).toBe(true); // imported → 不可删除
    expect(p.isImportedVariable('x.y')).toBe(false); // custom → 可编辑
    // example 预填 testData（快照还原即恢复作者测试数据）
    expect(p.getTestData()).toEqual({ 'a.b': '示例A', 'x.y': '示例X' });
  });

  it('hookImportBefore：不覆盖会话已有定义；快照标记 src 被规范化剥离', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.setVariableSchema([{ path: 'a.b', label: '会话权威' }]);
    p.hookImportBefore({
      variableMeta: {
        schema: [
          { path: 'a.b', label: '快照旧值', src: 'imported' },
          { path: 'c.d', src: 'custom' },
        ],
      },
    });
    const defs = p.getVariableSchema();
    expect(defs.find((d) => d.path === 'a.b').label).toBe('会话权威');
    expect(p.isImportedVariable('a.b')).toBe(true); // 会话已有（导入态）不被降级
    expect(defs.find((d) => d.path === 'c.d').label).toBe('c.d'); // label 缺省回退 path
    expect(defs.find((d) => d.path === 'c.d').src).toBeUndefined(); // src 非契约字段，被剥离
  });

  it('hookImportBefore：旧契约 variables[].example 兼容回填', () => {
    const p = new VariablePlugin(makeCanvas([]), makeEditor());
    p.hookImportBefore({
      variableMeta: {
        delimiter: { start: '{{', end: '}}' },
        variables: [{ path: 'a.b', example: '旧测试值' }],
      },
    });
    expect(p.getTestData()['a.b']).toBe('旧测试值');
    expect(p.getVariableSchema()).toEqual([]); // 旧契约不还原定义
  });
});

describe('VariablePlugin.useTestData 胶水契约（事件监听形态）', () => {
  it('schemaChange/testDataChange 事件与 apis/events 契约齐备', () => {
    expect(VariablePlugin.events).toContain('variable:schemaChange');
    const apis = VariablePlugin.apis;
    [
      'getVariableSchema',
      'setVariableSchema',
      'setSchemaAdapter',
      'ensureSchemaLoaded',
      'addCustomVariable',
      'updateCustomVariable',
      'removeCustomVariable',
      'isImportedVariable',
      'saveVariableSchema',
      'exportVariableSchema',
      'getVariableEntries',
    ].forEach((api) => expect(apis).toContain(api));
  });

  it('fabric 依赖可用（与既有插件测试一致的环境兜底）', () => {
    expect(fabric.Image).toBeDefined();
  });
});
