/**
 * legacyPosterUtils 单元测试：格式识别（isLegacy/hasPoster）、值转换（convertLegacyToStandard
 * 含 forEditor 剥锁）、变量提取（extractLegacyVarKeys）与示例值兜底（deriveFallbackSampleData）
 *
 * 重点回归：
 * - 点路径变量（如 {course.trainStage.stageIndex}）：旧引擎经 parseExp 按点路径取值，
 *   曾因 VAR_IDENT_REG 只认扁平标识符被漏掉 —— 预览无占位、未传 scopeKeys 时不转 {{}}
 * - 占位构建语义：扁平平铺、路径嵌套（平铺点 key 会以渲染器 exact-key-first
 *   遮蔽业务方嵌套对象真值，见 setPathPlaceholder 注释）
 * - 图片变量一律不填（静态固化语义）、表达式/噪声 token 排除
 */
import { fabric } from 'fabric';
import {
  isLegacyPosterConfig,
  hasPosterConfig,
  convertLegacyToStandard,
  extractLegacyVarKeys,
  deriveFallbackSampleData,
} from './legacyPosterUtils';

// 桥接：转换器默认加载器走 loadImageResilient，桥回 fabric.util.loadImage（测试经该
// spy mock 图片加载），并保留其"失败去 crossOrigin 重试"的回退语义，其余导出原样透传
jest.mock('@/core/imageLoader', () => {
  const actual = jest.requireActual('@/core/imageLoader');
  const { fabric } = require('fabric');
  const loadImageTheFabricWay = (url, crossOrigin) =>
    new Promise((resolve, reject) => {
      fabric.util.loadImage(
        url,
        (img, isError) => {
          if (isError) reject(new Error('image load failed: ' + url));
          else resolve(img);
        },
        null,
        crossOrigin
      );
    });
  return {
    ...actual,
    loadImageResilient: (url, opts) => {
      const crossOrigin = (opts && opts.crossOrigin) || 'anonymous';
      return loadImageTheFabricWay(url, crossOrigin).catch(() => loadImageTheFabricWay(url, null));
    },
  };
});

// 与渲染器 getValueByPath 同语义（先精确 key 后逐级路径），模拟合并后的取值结果
function getPathValue(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  const key = String(path);
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const segments = key.split('.');
  let current = obj;
  for (let i = 0; i < segments.length; i++) {
    if (current == null || typeof current !== 'object') return undefined;
    const seg = segments[i];
    if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined;
    current = current[seg];
  }
  return current;
}

function mockLoadImageByUrl(sizeMap) {
  return jest.spyOn(fabric.util, 'loadImage').mockImplementation((url, cb, thisArg) => {
    const key = Object.keys(sizeMap).find((k) => url.indexOf(k) !== -1);
    const size = (key && sizeMap[key]) || { w: 100, h: 100 };
    const el = document.createElement('img');
    Object.defineProperty(el, 'src', { value: url, writable: true, configurable: true });
    Object.defineProperty(el, 'width', { value: size.w, writable: true, configurable: true });
    Object.defineProperty(el, 'height', { value: size.h, writable: true, configurable: true });
    Object.defineProperty(el, 'naturalWidth', {
      value: size.w,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(el, 'naturalHeight', {
      value: size.h,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
    cb.call(thisArg, el, false);
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('isLegacyPosterConfig：旧格式识别', () => {
  it('含任一非空旧字段 → true（数组需非空）', () => {
    expect(isLegacyPosterConfig({ background: 'https://x/bg.png' })).toBe(true);
    expect(isLegacyPosterConfig({ avatarPosition: '72,90,126' })).toBe(true);
    expect(isLegacyPosterConfig({ text: [{ text: 'a' }] })).toBe(true);
    expect(isLegacyPosterConfig({ img: [], jsonList: [] })).toBe(false);
    expect(isLegacyPosterConfig({ background: '', text: [] })).toBe(false);
  });

  it('非法输入 / 标准格式 → false', () => {
    expect(isLegacyPosterConfig(null)).toBe(false);
    expect(isLegacyPosterConfig('str')).toBe(false);
    expect(isLegacyPosterConfig({ objects: [] })).toBe(false);
    expect(isLegacyPosterConfig({ objects: [{ type: 'rect' }] })).toBe(false);
  });
});

describe('hasPosterConfig：已配置判断（新旧格式）', () => {
  it('标准 objects 非空 → true', () => {
    expect(hasPosterConfig({ objects: [{ type: 'rect' }] })).toBe(true);
    expect(hasPosterConfig({ objects: [] })).toBe(false);
  });

  it('旧格式非空 → true；空/非法 → false', () => {
    expect(hasPosterConfig({ background: 'https://x/bg.png' })).toBe(true);
    expect(hasPosterConfig({})).toBe(false);
    expect(hasPosterConfig(null)).toBe(false);
  });
});

describe('convertLegacyToStandard：值 → 标准 JSON 字符串', () => {
  it('falsy 值返回空串', async () => {
    expect(await convertLegacyToStandard('')).toBe('');
    expect(await convertLegacyToStandard(null)).toBe('');
  });

  it('标准格式透传：字符串恒等、对象序列化', async () => {
    const str = '{"objects":[{"type":"rect"}]}';
    expect(await convertLegacyToStandard(str)).toBe(str);
    expect(await convertLegacyToStandard({ objects: [{ type: 'rect' }] })).toBe(
      '{"objects":[{"type":"rect"}]}'
    );
  });

  it('旧格式转换：背景定尺寸 + 文本变量保留 + 变量图保留', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1080, h: 1440 } });
    const legacy = {
      background: 'https://x/bg.png',
      avatarPosition: '72,90,126',
      text: [{ text: '{courseName}', x: '10', y: '20', color: '#fff', size: '30' }],
      img: [{ x: '10', y: '400', width: '40', height: '50', src: '{bookshelfImage}' }],
    };
    const str = await convertLegacyToStandard(legacy, {
      scopeKeys: ['courseName', 'bookshelfImage'],
    });
    const json = JSON.parse(str);
    expect(json.objects[0]).toMatchObject({ id: 'workspace', width: 1080, height: 1440 });
    const text = json.objects.find((o) => o.id === 'legacy-text-0');
    expect(text.text).toBe('{{courseName}}');
    // data 未提供值 → 变量图语义保留（业务标记；不带 lib 的 isVariableImage——
    // 标准变量图归渲染引擎布局，业务对象由业务 postRender 自治）
    const img = json.objects.find((o) => o.id === 'legacy-img-0');
    expect(img).toMatchObject({ src: '{{bookshelfImage}}', legacyVariableImg: { w: 40, h: 50 } });
    expect(img.isVariableImage).toBeUndefined();
  });

  it('未传 scopeKeys：自动扫描变量名兜底，转换结果一致', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1080, h: 1440 } });
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{courseName}', x: '10', y: '20', color: '#fff', size: '30' }],
      img: [{ x: '10', y: '400', width: '40', height: '50', src: '{bookshelfImage}' }],
    };
    const str = await convertLegacyToStandard(legacy);
    const json = JSON.parse(str);
    const text = json.objects.find((o) => o.id === 'legacy-text-0');
    expect(text.text).toBe('{{courseName}}');
    const img = json.objects.find((o) => o.id === 'legacy-img-0');
    expect(img).toMatchObject({ src: '{{bookshelfImage}}', legacyVariableImg: { w: 40, h: 50 } });
    expect(img.isVariableImage).toBeUndefined();
  });

  it('forEditor：旧格式转换结果剥离渲染锁（递归 group），workspace 保留', async () => {
    mockLoadImageByUrl({ 'bg.png': { w: 1080, h: 1440 } });
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{courseName}', x: '10', y: '20', color: '#fff', size: '30' }],
      jsonList: [
        {
          // 旧 fabric 序列化不带 selectable → 转换器补 selectable:false；含嵌套 group
          json: JSON.stringify({
            type: 'group',
            objects: [{ type: 'rect', selectable: false, lockMovementX: true }],
          }),
        },
      ],
    };
    const json = JSON.parse(
      await convertLegacyToStandard(legacy, { scopeKeys: ['courseName'], forEditor: true })
    );
    // 旧转换器为渲染输出，全部对象默认 selectable:false → 编辑器须剥离
    const text = json.objects.find((o) => o.id === 'legacy-text-0');
    expect(text.selectable).toBeUndefined();
    expect(text.hasControls).toBeUndefined();
    const group = json.objects.find((o) => o.type === 'group');
    expect(group.selectable).toBeUndefined();
    expect(group.objects[0].selectable).toBeUndefined();
    expect(group.objects[0].lockMovementX).toBeUndefined();
    // workspace 画板保留锁定（编辑器 WorkspacePlugin 自行管理）
    const workspace = json.objects.find((o) => o.id === 'workspace');
    expect(workspace.selectable).toBe(false);
  });

  it('forEditor：标准格式透传同样剥锁，且不污染入参对象', async () => {
    const input = {
      objects: [
        { type: 'rect', id: 'workspace', selectable: false, evented: false },
        { type: 'textbox', selectable: false, hasControls: false },
        {
          type: 'group',
          objects: [{ type: 'rect', selectable: false, lockScalingY: true }],
        },
      ],
    };
    const json = JSON.parse(await convertLegacyToStandard(input, { forEditor: true }));
    expect(json.objects[0]).toEqual({
      type: 'rect',
      id: 'workspace',
      selectable: false,
      evented: false,
    });
    expect(json.objects[1].selectable).toBeUndefined();
    expect(json.objects[1].hasControls).toBeUndefined();
    expect(json.objects[2].objects[0].selectable).toBeUndefined();
    expect(json.objects[2].objects[0].lockScalingY).toBeUndefined();
    // 入参对象未被原地修改
    expect(input.objects[1].selectable).toBe(false);
  });
});

describe('extractLegacyVarKeys：旧数据变量名自动提取', () => {
  it('扫描 text/img/jsonList 中真正消费变量的字段', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{courseName}发布' }],
      img: [{ src: '{bookshelfImage}' }],
      jsonList: [
        { json: JSON.stringify({ type: 'text', text: '{periodName}' }) },
        { json: JSON.stringify({ type: 'image', src: '{avatar}' }) },
      ],
    };
    expect(extractLegacyVarKeys(legacy)).toEqual(
      expect.arrayContaining(['courseName', 'bookshelfImage', 'periodName', 'avatar'])
    );
  });

  it('扁平与点路径变量均收集，跨 text/img/jsonList 汇总（精确顺序，非法 jsonList 容错）', () => {
    const config = {
      background: 'https://x/bg.png',
      avatarPosition: '100,100,50',
      nickNamePosition: '0,0,#000000',
      qrCodePosition: '30,1500,120',
      text: [{ text: '姓名 {name}，第 {course.trainStage.stageIndex} 期' }],
      img: [{ src: '{course.cover}' }],
      jsonList: [
        { json: JSON.stringify({ text: '{nickname}', src: '{qrcode}' }) },
        { json: 'not json' },
      ],
    };
    expect(extractLegacyVarKeys(config)).toEqual([
      'name',
      'course.trainStage.stageIndex',
      'course.cover',
      'nickname',
      'qrcode',
    ]);
  });

  it('JSON 字符串入参与对象入参等价', () => {
    const legacy = { background: 'https://x/bg.png', img: [{ src: '{bookshelfImage}' }] };
    expect(extractLegacyVarKeys(JSON.stringify(legacy))).toEqual(['bookshelfImage']);
  });

  it('过滤非标识符 / 表达式上下文键 / 尺寸表达式', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{naturalWidth} {a b} {x-y} {9abc} {ok1}' }],
      jsonList: [
        // 尺寸表达式字段不在扫描范围（只扫 text/src），不会被误收
        {
          json: JSON.stringify({
            type: 'image',
            width: '{naturalWidth}',
            scaleX: '{150/naturalWidth}',
          }),
        },
      ],
    };
    expect(extractLegacyVarKeys(legacy)).toEqual(['ok1']);
  });

  it('收集中文变量名（存量运营数据 {格言}/{数字日} 等）', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{格言} —— {格言作者}' }],
      jsonList: [{ json: JSON.stringify({ type: 'text', text: '{今日学习}{共学习}{总学习}' }) }],
      img: [{ src: '{数字日}' }],
    };
    expect(extractLegacyVarKeys(legacy)).toEqual([
      '格言',
      '格言作者',
      '数字日',
      '今日学习',
      '共学习',
      '总学习',
    ]);
  });

  it('跳过双花括号（与转换器语义一致）', () => {
    const legacy = { background: 'https://x/bg.png', text: [{ text: '{{already}} {single}' }] };
    expect(extractLegacyVarKeys(legacy)).toEqual(['single']);
  });

  it('点路径变量按整段收集（每段须为合法标识符）', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '第 {course.trainStage.stageIndex} 期 {a.b.9c} {course..x}' }],
      img: [{ src: '{course.cover}' }],
    };
    expect(extractLegacyVarKeys(legacy)).toEqual(['course.trainStage.stageIndex', 'course.cover']);
  });

  it('标准 JSON / 非旧格式 / 非法 JSON / 空值 → []', () => {
    expect(extractLegacyVarKeys({ objects: [{ type: 'text', text: '{a}' }] })).toEqual([]);
    expect(extractLegacyVarKeys('not json')).toEqual([]);
    expect(extractLegacyVarKeys(null)).toEqual([]);
    expect(extractLegacyVarKeys({})).toEqual([]);
    expect(extractLegacyVarKeys('')).toEqual([]);
  });
});

describe('deriveFallbackSampleData：sampleData 自动兜底', () => {
  it('文本变量填 {key}，图片变量不填', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{nickname}发布' }],
      img: [{ src: '{bookshelfImage}' }],
    };
    expect(deriveFallbackSampleData(legacy)).toEqual({ nickname: '{nickname}' });
  });

  it('中文文本变量同样兜底填 {key}', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{格言} —— {格言作者}' }],
    };
    expect(deriveFallbackSampleData(legacy)).toEqual({
      格言: '{格言}',
      格言作者: '{格言作者}',
    });
  });

  it('同名 key 同时用于文本与图片 → 一律不填（避免图片被静态固化）', () => {
    const legacy = {
      background: 'https://x/bg.png',
      text: [{ text: '{avatar}' }],
      img: [{ src: '{avatar}' }],
    };
    expect(deriveFallbackSampleData(legacy)).toEqual({});
  });

  it('jsonList：obj.text 填、obj.src 不填', () => {
    const legacy = {
      background: 'https://x/bg.png',
      jsonList: [
        { json: JSON.stringify({ type: 'text', text: '{periodName}' }) },
        { json: JSON.stringify({ type: 'image', src: '{qrcode}' }) },
      ],
    };
    expect(deriveFallbackSampleData(legacy)).toEqual({ periodName: '{periodName}' });
  });

  it('JSON 字符串入参 / 非法 JSON / 空值', () => {
    const legacy = { background: 'https://x/bg.png', text: [{ text: '{nickname}' }] };
    expect(deriveFallbackSampleData(JSON.stringify(legacy))).toEqual({ nickname: '{nickname}' });
    expect(deriveFallbackSampleData('not json')).toEqual({});
    expect(deriveFallbackSampleData(null)).toEqual({});
    expect(deriveFallbackSampleData({})).toEqual({});
    expect(deriveFallbackSampleData('')).toEqual({});
  });

  it('标准 fabric JSON（编辑器保存回传后）：text 的 {{key}} 填，isVariableImage 不填', () => {
    const standard = {
      objects: [
        { type: 'textbox', text: '{{nickname}}发布了{{courseName}}' },
        { type: 'image', src: '{{bookshelfImage}}', isVariableImage: true },
      ],
    };
    expect(deriveFallbackSampleData(standard)).toEqual({
      nickname: '{nickname}',
      courseName: '{courseName}',
    });
  });

  it('标准 JSON：同名 key 同时用于文本与图片 → 不填', () => {
    const standard = {
      objects: [
        { type: 'textbox', text: '{{avatar}}' },
        { type: 'image', src: '{{avatar}}', isVariableImage: true },
      ],
    };
    expect(deriveFallbackSampleData(standard)).toEqual({});
  });

  it('标准 objects：双花括号路径变量同样嵌套占位；变量图不填', () => {
    const config = {
      objects: [
        { type: 'i-text', text: '第 {{course.trainStage.stageIndex}} 期 · {{name}}' },
        { type: 'image', isVariableImage: true, src: '{{course.cover}}' },
      ],
    };
    const data = deriveFallbackSampleData(config);
    expect(data.name).toBe('{name}');
    expect(data.course).toEqual({ trainStage: { stageIndex: '{course.trainStage.stageIndex}' } });
    // 图片路径变量不参与占位构建（保持变量图分支）
    expect(getPathValue(data, 'course.cover')).toBeUndefined();
  });

  it('点路径变量嵌套写入：扁平/路径并存，图片路径变量不填，同根冲突路径优先', () => {
    const config = {
      background: 'https://x/bg.png',
      text: [
        {
          text: '姓名 {name}，第 {course.trainStage.stageIndex} 期，{consultForm} {consultForm.startDateYear}',
        },
      ],
      img: [{ src: '{course.cover}' }],
    };
    const data = deriveFallbackSampleData(config);
    expect(data.name).toBe('{name}');
    expect(data.course).toEqual({ trainStage: { stageIndex: '{course.trainStage.stageIndex}' } });
    expect(data.consultForm).toEqual({ startDateYear: '{consultForm.startDateYear}' });
    // 图片路径变量不参与占位构建（保持变量图分支）
    expect(getPathValue(data, 'course.cover')).toBeUndefined();
  });

  it('与业务 sampleData 顶层浅合并：嵌套对象/平铺点 key 真值均不被占位遮蔽', () => {
    const config = {
      objects: [
        {
          type: 'i-text',
          text: '{{name}} {{consultForm.startDateYear}} {{course.trainStage.stageIndex}}',
        },
      ],
    };
    const business = {
      consultForm: { startDateYear: '2025' },
      'course.trainStage.stageIndex': 20,
      name: '放冰箱',
    };
    const merged = { ...deriveFallbackSampleData(config), ...business };
    // 嵌套真值整键覆盖占位（占位不被平铺点 key 遮蔽）
    expect(getPathValue(merged, 'consultForm.startDateYear')).toBe('2025');
    // 平铺点 key 真值精确命中（优先于嵌套占位路径）
    expect(getPathValue(merged, 'course.trainStage.stageIndex')).toBe(20);
    expect(getPathValue(merged, 'name')).toBe('放冰箱');

    // 业务未提供时嵌套占位兜底
    const fallback = deriveFallbackSampleData(config);
    expect(getPathValue(fallback, 'consultForm.startDateYear')).toBe('{consultForm.startDateYear}');
    expect(getPathValue(fallback, 'course.trainStage.stageIndex')).toBe(
      '{course.trainStage.stageIndex}'
    );
  });

  it('variableMeta.schema 示例值：优先于 {key} 占位（数字归一/空示例跳过/图片变量不填）', () => {
    const config = {
      objects: [
        {
          type: 'i-text',
          text: '{{name}} {{course.trainStage.stageIndex}} {{noExample}} {{emptyExample}}',
        },
        { type: 'image', isVariableImage: true, src: '{{course.cover}}' },
      ],
      variableMeta: {
        version: 1,
        delimiter: { start: '{{', end: '}}' },
        schema: [
          { path: 'name', label: 'name', type: 'text', example: '方方方', defaultValue: '' },
          {
            path: 'course.trainStage.stageIndex',
            label: 'course.trainStage.stageIndex',
            type: 'text',
            example: 20,
            defaultValue: '',
          },
          { path: 'noExample', label: 'noExample', type: 'text', example: '', defaultValue: '' },
          {
            path: 'emptyExample',
            label: 'emptyExample',
            type: 'text',
            example: '',
            defaultValue: '',
          },
          {
            path: 'course.cover',
            label: 'course.cover',
            type: 'image',
            example: 'http://x/c.png',
            defaultValue: '',
          },
        ],
      },
    };
    const data = deriveFallbackSampleData(config);
    expect(data.name).toBe('方方方');
    expect(data.course).toEqual({ trainStage: { stageIndex: '20' } });
    expect(data.noExample).toBe('{noExample}');
    expect(data.emptyExample).toBe('{emptyExample}');
    // schema 有示例的图片变量仍不填（保持变量图分支）
    expect(getPathValue(data, 'course.cover')).toBeUndefined();
  });

  it('旧格式配置也可读 variableMeta.schema 示例值', () => {
    const config = {
      background: 'https://x/bg.png',
      text: [{ text: '姓名 {name}' }],
      variableMeta: { schema: [{ path: 'name', label: 'name', type: 'text', example: '方方方' }] },
    };
    expect(deriveFallbackSampleData(config).name).toBe('方方方');
  });

  it('合并优先级：业务 sampleData > variableMeta.schema 示例 > {key} 占位', () => {
    const config = {
      objects: [{ type: 'i-text', text: '{{name}} {{course.trainStage.stageIndex}}' }],
      variableMeta: {
        schema: [
          { path: 'name', label: 'name', type: 'text', example: '方方方' },
          { path: 'course.trainStage.stageIndex', label: 'stageIndex', type: 'text', example: 20 },
        ],
      },
    };
    const merged = { ...deriveFallbackSampleData(config), name: '放冰箱' };
    expect(getPathValue(merged, 'name')).toBe('放冰箱');
    expect(getPathValue(merged, 'course.trainStage.stageIndex')).toBe('20');
  });
});
