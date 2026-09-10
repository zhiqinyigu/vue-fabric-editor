/**
 * 变量 Schema（变量字典）纯函数测试
 * 1) 类型推断 / 定义清洗 / 定义校验
 * 2) 变量表与模板扫描结果对齐（defined/unknown）
 * 3) 默认值补齐（与渲染取值语义一致，不覆盖已有值，不污染入参）
 * 4) 示例值预填（扁平映射表语义）
 * 5) C 端渲染 schema 解析优先级
 */
import {
  inferVariableType,
  normalizeVariableDef,
  validateVariableDef,
  mergeVariableSchema,
  applySchemaDefaults,
  applySchemaExamplesFlat,
  resolveRenderSchema,
} from '../../src/core/variableSchema';

describe('inferVariableType：占位字段 → 变量类型', () => {
  it('标准字段映射', () => {
    expect(inferVariableType('text')).toBe('text');
    expect(inferVariableType('src')).toBe('image');
    expect(inferVariableType('extension.data')).toBe('qrcode');
    expect(inferVariableType('extension.value')).toBe('barcode');
  });

  it('未知/非法字段回退 text', () => {
    expect(inferVariableType('unknown.field')).toBe('text');
    expect(inferVariableType(undefined)).toBe('text');
    expect(inferVariableType(123)).toBe('text');
  });
});

describe('normalizeVariableDef：业务侧脏数据清洗', () => {
  it('规范化字段并 trim', () => {
    const def = normalizeVariableDef({
      path: ' course.name ',
      label: ' 课程名称 ',
      type: 'image',
      required: 1,
      example: 123,
      defaultValue: null,
      description: '课程名',
    });
    expect(def).toEqual({
      path: 'course.name',
      label: '课程名称',
      type: 'image',
      example: '',
      defaultValue: '',
      description: '课程名',
    });
  });

  it('label 缺省回退为 path；未知 type 回退 text', () => {
    const def = normalizeVariableDef({ path: 'a.b', type: 'unknown' });
    expect(def.label).toBe('a.b');
    expect(def.type).toBe('text');
  });

  it('path 非法返回 null', () => {
    expect(normalizeVariableDef(null)).toBeNull();
    expect(normalizeVariableDef({})).toBeNull();
    expect(normalizeVariableDef({ path: '   ' })).toBeNull();
    expect(normalizeVariableDef({ path: 42 })).toBeNull();
  });
});

describe('validateVariableDef：表单/入口共用校验', () => {
  it('合法定义通过', () => {
    const r = validateVariableDef(
      { path: 'course.name', label: '课程名称' },
      { existingPaths: ['a.b'] }
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('空 path / 空 label', () => {
    expect(validateVariableDef({ path: '', label: 'x' }).errors).toContain('empty_path');
    expect(validateVariableDef({ path: 'a', label: '  ' }).errors).toContain('empty_label');
  });

  it('path 含空白 / 含包裹符（默认与自定义）', () => {
    expect(validateVariableDef({ path: 'a b', label: 'x' }).errors).toContain('path_whitespace');
    expect(validateVariableDef({ path: '{{a}}', label: 'x' }).errors).toContain('path_delimiter');
    const custom = validateVariableDef(
      { path: 'a<%=x%>b', label: 'x' },
      { delimiter: { start: '<%=', end: '%>' } }
    );
    expect(custom.errors).toContain('path_delimiter');
  });

  it('path 与已有定义重复', () => {
    const r = validateVariableDef({ path: 'a.b', label: 'x' }, { existingPaths: ['a.b', 'c.d'] });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('path_duplicate');
  });
});

describe('mergeVariableSchema：变量表与模板扫描结果对齐', () => {
  const defs = [
    { path: 'course.name', label: '课程名称', type: 'text' },
    { path: 'lecturer.avatar', label: '讲师头像', type: 'image' },
    { path: 'course.teacher', label: '讲师姓名', type: 'text' },
  ];

  it('used 对齐 + 多字段聚合', () => {
    const scanned = [
      { path: 'course.name', field: 'text' },
      { path: 'lecturer.avatar', field: 'src' },
      { path: 'course.name', field: 'src' },
    ];
    const { defined, unknown } = mergeVariableSchema(defs, scanned);
    expect(defined).toHaveLength(3);
    const nameVar = defined.find((d) => d.path === 'course.name');
    expect(nameVar.used).toBe(true);
    expect(nameVar.fields).toEqual(['text', 'src']);
    const teacherVar = defined.find((d) => d.path === 'course.teacher');
    expect(teacherVar.used).toBe(false);
    expect(teacherVar.fields).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it('未定义占位符进入 unknown 并推断类型', () => {
    const scanned = [
      { path: 'course.name', field: 'text' },
      { path: 'mystery.img', field: 'src' },
      { path: 'mystery.qr', field: 'extension.data' },
    ];
    const { defined, unknown } = mergeVariableSchema(defs, scanned);
    expect(defined.find((d) => d.path === 'course.name').used).toBe(true);
    expect(unknown).toHaveLength(2);
    const img = unknown.find((u) => u.path === 'mystery.img');
    expect(img.suggestedType).toBe('image');
    expect(img.fields).toEqual(['src']);
    const qr = unknown.find((u) => u.path === 'mystery.qr');
    expect(qr.suggestedType).toBe('qrcode');
  });

  it('defs 重复 path 去重（首个保留）', () => {
    const dup = [
      { path: 'a.b', label: '第一个' },
      { path: 'a.b', label: '第二个' },
    ];
    const { defined } = mergeVariableSchema(dup, []);
    expect(defined).toHaveLength(1);
    expect(defined[0].label).toBe('第一个');
  });

  it('非法入参容错且不污染入参', () => {
    const defsInput = [{ path: 'a.b', label: 'x' }];
    const scannedInput = [{ path: 'a.b', field: 'text' }];
    const { defined } = mergeVariableSchema(defsInput, scannedInput);
    expect(defined[0].used).toBe(true);
    expect(defined[0].fields).toEqual(['text']);
    // 入参未被追加 used/fields
    expect(defsInput[0]).toEqual({ path: 'a.b', label: 'x' });
    expect(mergeVariableSchema(null, null)).toEqual({ defined: [], unknown: [] });
  });
});

describe('applySchemaDefaults：默认值补齐', () => {
  const defs = [
    { path: 'course.name', label: '课程', defaultValue: '默认课程' },
    { path: 'lecturer.name', label: '讲师', defaultValue: '默认讲师' },
    { path: 'business.name', label: '店铺', defaultValue: '默认店铺' },
    { path: 'no.default', label: '无默认', type: 'text' },
  ];

  it('补齐嵌套路径缺失值', () => {
    const out = applySchemaDefaults({}, defs);
    expect(out).toEqual({
      course: { name: '默认课程' },
      lecturer: { name: '默认讲师' },
      business: { name: '默认店铺' },
    });
    expect(out.no).toBeUndefined();
  });

  it('已有值（含空串）不覆盖；null/undefined 视为缺失', () => {
    const data = {
      'course.name': '真实课程',
      lecturer: { name: '' },
      business: { name: null },
    };
    const out = applySchemaDefaults(data, defs);
    expect(out['course.name']).toBe('真实课程');
    expect(out.lecturer.name).toBe('');
    expect(out.business.name).toBe('默认店铺');
  });

  it('扁平映射表：完整路径顶层 key 优先', () => {
    const data = { 'course.name': '扁平值' };
    const out = applySchemaDefaults(data, defs);
    expect(out['course.name']).toBe('扁平值');
    expect(out.lecturer.name).toBe('默认讲师');
  });

  it('无需补齐时返回原引用（零拷贝）', () => {
    const data = { 'course.name': 'x', lecturer: { name: 'y' }, business: { name: 'z' } };
    expect(applySchemaDefaults(data, defs)).toBe(data);
    expect(applySchemaDefaults({}, [])).toEqual({});
  });

  it('不污染入参', () => {
    const data = {};
    applySchemaDefaults(data, defs);
    expect(data).toEqual({});
  });

  it('非法入参容错', () => {
    expect(applySchemaDefaults(null, defs)).toEqual({
      course: { name: '默认课程' },
      lecturer: { name: '默认讲师' },
      business: { name: '默认店铺' },
    });
    expect(applySchemaDefaults({ a: 1 }, null)).toEqual({ a: 1 });
    expect(applySchemaDefaults('str', defs)).toEqual({
      course: { name: '默认课程' },
      lecturer: { name: '默认讲师' },
      business: { name: '默认店铺' },
    });
  });
});

describe('resolveRenderSchema：C 端渲染 schema 解析优先级', () => {
  const metaJson = { variableMeta: { schema: [{ path: 'a.b', defaultValue: 'd' }] } };

  it('显式注入完全优先（props > options > 模板快照），不 merge', () => {
    expect(resolveRenderSchema(metaJson, [{ path: 'x' }], [{ path: 'y' }])).toEqual([
      { path: 'x' },
    ]);
    expect(resolveRenderSchema(metaJson, null, [{ path: 'y' }])).toEqual([{ path: 'y' }]);
    expect(resolveRenderSchema(metaJson, [], null)).toEqual([{ path: 'a.b', defaultValue: 'd' }]);
  });

  it('无可用 schema 返回 null（零开销跳过默认值回退）', () => {
    expect(resolveRenderSchema({}, null, null)).toBeNull();
    expect(resolveRenderSchema(null, null, null)).toBeNull();
    expect(resolveRenderSchema({ variableMeta: {} }, null, null)).toBeNull();
    expect(resolveRenderSchema({ variableMeta: { schema: [] } }, null, null)).toBeNull();
  });
});

describe('applySchemaExamplesFlat：示例值预填（扁平映射表）', () => {
  const defs = [
    { path: 'course.name', label: '课程', example: '示例课程' },
    { path: 'lecturer.name', label: '讲师', example: '张三' },
    { path: 'business.name', label: '店铺' },
  ];

  it('缺失 key 按 example 预填（扁平 key 写入）', () => {
    expect(applySchemaExamplesFlat({}, defs)).toEqual({
      'course.name': '示例课程',
      'lecturer.name': '张三',
    });
  });

  it('已填值（含空串）不覆盖；无 example 的变量不写入', () => {
    const map = { 'course.name': '已填', 'lecturer.name': '' };
    expect(applySchemaExamplesFlat(map, defs)).toEqual({
      'course.name': '已填',
      'lecturer.name': '',
    });
  });

  it('不污染入参；非法入参容错', () => {
    const map = {};
    applySchemaExamplesFlat(map, defs);
    expect(map).toEqual({});
    expect(applySchemaExamplesFlat(null, defs)).toEqual({
      'course.name': '示例课程',
      'lecturer.name': '张三',
    });
    expect(applySchemaExamplesFlat({ a: 1 }, null)).toEqual({ a: 1 });
  });
});
