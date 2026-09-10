/*
 * 旧版 posterConfig（course-detail marketConfig.courseXxxPosterConfig 同构）兼容工具
 *
 * 旧格式字段：background / avatarPosition("x,y,size") / nickNamePosition("x,y,color") /
 * qrCodePosition("x,y,size") / text[] / img[] / jsonList[] / mode
 * 标准格式：FabricEditor 导出的 fabric canvas JSON（顶层 objects[]）
 */

/** 旧版 posterConfig 的内容字段（任一非空即视为已配置） */
const LEGACY_VALUE_FIELDS = [
  'background',
  'backgroundColor',
  'avatarPosition',
  'avatar',
  'nickNamePosition',
  'nickname',
  'qrCodePosition',
  'qrcode',
  'text',
  'texts',
  'img',
  'imgs',
  'jsonList',
];

/** 是否为旧版 posterConfig（非标准 objects 且含旧字段特征） */
export function isLegacyPosterConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config.objects)) return false;
  return LEGACY_VALUE_FIELDS.some((k) => {
    const v = config[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '';
  });
}

// 与 legacyConverter.replaceSingleBraceVars 相同的单花括号变量语义（跳过 {{}} 双括号；
// 不用 lookbehind 以兼容旧 iOS Safari）。独立实现以避免静态引入转换器（含 fabric 重依赖）。
function forEachSingleBraceVar(text, onMatch) {
  if (typeof text !== 'string') return;
  text.replace(/\{([^{}]+)\}/g, (m, key, offset) => {
    if (text[offset - 1] === '{' || text[offset + m.length] === '}') return m;
    onMatch(key);
    return m;
  });
}

// 变量名须为合法标识符（支持中文/Unicode 字母，如 {格言}/{数字日}）：
// 天然排除 {a b}/{x-y}/{150/naturalWidth} 等表达式/噪声 token
const VAR_IDENT_REG = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
// 点路径变量（如 {course.trainStage.stageIndex}）：整体按 `.` 拆段，每段须为合法标识符。
// 转换器（getPathValue）与渲染器（getValueByPath）同语义：先精确完整串、再逐级路径取值
const VAR_PATH_REG = /^[\p{L}_$][\p{L}\p{N}_$]*(\.[\p{L}_$][\p{L}\p{N}_$]*)+$/u;
const isVarToken = (key) => VAR_IDENT_REG.test(key) || VAR_PATH_REG.test(key);
// 表达式上下文键（jsonList 图片字段 {naturalWidth} 等求值用）不是业务变量
const EXPR_CONTEXT_KEYS = ['naturalWidth', 'naturalHeight'];
// 二维码/条形码内容字段（extension 嵌套）；内容变量按“文本型”兜底（缺值填 {key}），
// 否则数据模式下内容被清空 → 生成端报 "QR code is empty" → 元素被丢弃
const EXTENSION_CONTENT_FIELD = { qrcode: 'data', barcode: 'value' };

/**
 * 从旧格式 posterConfig 自动扫描变量名候选集（业务未传 scopeKeys 时的兜底）。
 * 只扫转换器真正消费变量的字段：text[].text、img[].src、jsonList 内 obj.text / obj.src；
 * 其余字段的 {expr} 为尺寸表达式（如 {naturalWidth}），不属于变量，不扫。
 * 判定语义（单花括号/跳过双花括号/标识符或点路径过滤）与 convertLegacyPoster 的 knownKeys 匹配保持一致。
 * @param {Object|String} config 旧格式对象或 JSON 字符串
 * @returns {String[]} 变量名列表（标准 fabric JSON / 非旧格式 / 非法 JSON → []）
 */
export function extractLegacyVarKeys(config) {
  let obj = config;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch (e) {
      return [];
    }
  }
  if (!isLegacyPosterConfig(obj)) return [];
  const keys = new Set();
  const collect = (key) => {
    const k = String(key).trim();
    if (isVarToken(k) && EXPR_CONTEXT_KEYS.indexOf(k) === -1) keys.add(k);
  };
  (obj.text || obj.texts || []).forEach((item) => {
    if (item) forEachSingleBraceVar(item.text == null ? '' : String(item.text), collect);
  });
  (obj.img || obj.imgs || []).forEach((item) => {
    if (item) forEachSingleBraceVar(item.src == null ? '' : String(item.src), collect);
  });
  (obj.jsonList || []).forEach((item) => {
    let parsed;
    try {
      parsed = item && item.json ? JSON.parse(item.json) : null;
    } catch (e) {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    forEachSingleBraceVar(parsed.text, collect);
    forEachSingleBraceVar(parsed.src, collect);
  });
  return Array.from(keys);
}

// 标准 fabric JSON 的 {{key}} 变量提取（标准模板只用双花括号，单花括号是字面文本）
function forEachDoubleBraceVar(text, onMatch) {
  if (typeof text !== 'string') return;
  text.replace(/\{\{([^{}]+)\}\}/g, (m, key) => {
    onMatch(key);
    return m;
  });
}

// 标准 JSON 变量分类扫描：文本对象 text 中的 {{key}} 为文本变量；
// 图片对象（image 形态，含 legacy 转换产物的头像/变量图——它们无 isVariableImage 标记）
// src 的 {{key}} 为图片变量（占位兜底注册时渲染期显示占位，缺值时仍不注入示例 URL）；
// 二维码/条形码的 extension.data / extension.value 内容变量单独收集（onCode）兜底
function forEachStandardVarKey(obj, onText, onImage, onCode) {
  (obj.objects || []).forEach((o) => {
    if (!o || typeof o !== 'object') return;
    forEachDoubleBraceVar(o.text, onText);
    if (o.type === 'image' || o.isVariableImage) forEachDoubleBraceVar(o.src, onImage);
    const extField = o.extensionType && EXTENSION_CONTENT_FIELD[o.extensionType];
    if (extField) forEachDoubleBraceVar(o.extension && o.extension[extField], onCode);
  });
}

// 变量名分类扫描：onText 收文本变量，onImage 收图片变量（img[].src / jsonList obj.src）
function forEachLegacyVarKey(obj, onText, onImage) {
  (obj.text || obj.texts || []).forEach((item) => {
    if (item) forEachSingleBraceVar(item.text == null ? '' : String(item.text), onText);
  });
  (obj.img || obj.imgs || []).forEach((item) => {
    if (item) forEachSingleBraceVar(item.src == null ? '' : String(item.src), onImage);
  });
  (obj.jsonList || []).forEach((item) => {
    let parsed;
    try {
      parsed = item && item.json ? JSON.parse(item.json) : null;
    } catch (e) {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    forEachSingleBraceVar(parsed.text, onText);
    forEachSingleBraceVar(parsed.src, onImage);
  });
}

// 点路径值按嵌套结构写入（如 course.trainStage.stageIndex → {course:{trainStage:{stageIndex:值}}}）。
// 不能用平铺点 key（'course.trainStage.stageIndex' 作顶层 key）：渲染器 getValueByPath 先精确
// key 后逐级路径，平铺占位/示例会以精确命中遮蔽业务方以嵌套对象提供的真值（如 consultForm.startDateYear）。
// 与业务真值经顶层浅合并（{...derived, ...sampleData}）互不打架：
// - 业务嵌套对象（consultForm）→ 同名顶层键整键覆盖，真值生效
// - 业务平铺点 key（'course.name'）→ 与嵌套值分属不同顶层键共存，精确命中真值
// - 业务未提供 → 嵌套占位/示例兜底
// 同根扁平与路径冲突（{{consultForm}} 与 {{consultForm.startDateYear}}）时路径优先：
// 已有字符串会被重建为对象，调用方对扁平 key 有对象守卫
function setPathValue(data, path, value) {
  const segments = String(path).split('.');
  let current = data;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (current[seg] == null || typeof current[seg] !== 'object') current[seg] = {};
    current = current[seg];
  }
  current[segments[segments.length - 1]] = value;
}

// 默认示例图：240x160 纯色底 dataURL。规格与 @/core/variablePlaceholder.js 的
// makeVariablePlaceholderDataUrl 一致（parity 由 legacyPosterUtils.test.js 守护）；
// 此处独立实现以保持本文件可整体拷贝，不引用主包内部模块。无 canvas 环境返回 ''
function makeDefaultImageDataUrl() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F1F3F5';
    ctx.fillRect(0, 0, 240, 160);
    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

// 图片变量默认示例图：惰性生成并缓存，失败（无 canvas 环境等）退化为空串 →
// 调用方跳过写入，保持原“不填”行为
let cachedDefaultImageSample;
function getDefaultImageSample() {
  if (cachedDefaultImageSample === undefined) {
    try {
      cachedDefaultImageSample = makeDefaultImageDataUrl() || '';
    } catch (e) {
      cachedDefaultImageSample = '';
    }
  }
  return cachedDefaultImageSample;
}

/**
 * 未传/缺省 sampleData 时的示例值自动推导（按 key 与外部传入合并，外部优先）。
 * 旧格式：文本变量（text[].text / jsonList obj.text）→ 填 `{key}`（预览显示变量名占位）；
 * 标准 fabric JSON（编辑器保存回传后的值形态）：文本对象 text 中的 {{key}} → 填 `{key}`。
 * 图片变量不填 `{key}` 占位（占位串会被当 URL 加载失败导致元素丢弃），示例值来源见下。
 * 示例值优先级：业务 sampleData（Entry.vue 顶层浅合并覆盖）>
 * 后台变量表 remoteSchemaDefs 示例（variableSchemaAdapter 拉取，多人协同权威）>
 * variableMeta.schema 内嵌快照；文本变量末位退 `{key}` 占位。
 * 文本变量：schema/后台有 example → 注入；否则 `{key}` 占位。
 * 图片变量：example（图片 URL）> defaultValue（渲染回退图，需早于默认纯色以防被遮蔽）>
 * 默认纯色图（规格同 variablePlaceholder 占位底图，保证示例模式不缺图）。
 * 二维码/条形码内容变量（标准 JSON 的 extension.data / extension.value）按“文本型”兜底：
 * example > defaultValue > `{key}`（示例模式生成占位码；否则内容被清空 → 生成端报
 * "QR code is empty" → 元素被丢弃）。注意旧格式原始配置不含该变量（转换器写死
 * {{$posterShareUrl}}），须在**转换后的标准 JSON** 上派生（LegacyPosterEntry 即此路径）。
 * 同名 key 同时用于文本与图片：一律不填（同一数据路径只能一个值，URL 会以文本形式显示）。
 * 点路径变量（如 {course.trainStage.stageIndex}）按嵌套结构写入（见 setPathValue），
 * 扁平变量仍平铺写入；同根扁平与路径冲突时路径优先（扁平 key 已成对象则跳过）。
 * @param {Object|String} config 旧格式对象 / 标准 fabric JSON / JSON 字符串
 * @param {Array} [remoteSchemaDefs] 后台变量表定义数组（adapters.variable list 的产物；
 *        同 path 覆盖内嵌快照；缺省/为空时行为不变）
 * @returns {Object} 示例数据（非旧格式且非标准 objects / 非法 JSON → {}）
 */
export function deriveFallbackSampleData(config, remoteSchemaDefs) {
  let obj = config;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch (e) {
      return {};
    }
  }
  const imgKeys = new Set();
  const textKeys = new Set();
  const codeKeys = new Set();
  const makeCollect = (set) => (key) => {
    const k = String(key).trim();
    if (isVarToken(k) && EXPR_CONTEXT_KEYS.indexOf(k) === -1) set.add(k);
  };
  if (isLegacyPosterConfig(obj)) {
    forEachLegacyVarKey(obj, makeCollect(textKeys), makeCollect(imgKeys));
  } else if (obj && typeof obj === 'object' && Array.isArray(obj.objects)) {
    forEachStandardVarKey(obj, makeCollect(textKeys), makeCollect(imgKeys), makeCollect(codeKeys));
  } else {
    return {};
  }
  // variableMeta.schema 示例值（编辑器全量导出自带；精简导出仅 {path, defaultValue}
  // 无 example，此时图片走 defaultValue / 默认纯色，二维码/条形码走 defaultValue / `{key}`）。
  // remoteSchemaDefs（后台变量表）后写入：同 path 覆盖内嵌快照（后台权威，多人协同）。
  // defaultValue 仅用于图片与二维码/条形码，避免遮蔽文本变量渲染端 applySchemaDefaults 的既有回退
  const exampleMap = new Map();
  const defaultValueMap = new Map();
  const fillDefs = (defs, field, map) => {
    (Array.isArray(defs) ? defs : []).forEach((d) => {
      if (!d || typeof d.path !== 'string') return;
      const key = d.path.trim();
      if (!key || d[field] == null || d[field] === '') return;
      map.set(key, String(d[field]));
    });
  };
  const embeddedSchema =
    obj && obj.variableMeta && Array.isArray(obj.variableMeta.schema)
      ? obj.variableMeta.schema
      : [];
  fillDefs(embeddedSchema, 'example', exampleMap);
  fillDefs(remoteSchemaDefs, 'example', exampleMap);
  fillDefs(embeddedSchema, 'defaultValue', defaultValueMap);
  fillDefs(remoteSchemaDefs, 'defaultValue', defaultValueMap);

  const data = {};
  // 二维码/条形码内容变量：example > defaultValue > `{key}`（占位码）；defaultValue 需优先于
  // `{key}`，否则占位会遮蔽渲染端 applySchemaDefaults 的既有回退。同名图片变量的场景让位图片。
  codeKeys.forEach((k) => {
    if (imgKeys.has(k)) return;
    let value;
    if (exampleMap.has(k)) value = exampleMap.get(k);
    else if (defaultValueMap.has(k)) value = defaultValueMap.get(k);
    else value = `{${k}}`;
    if (VAR_PATH_REG.test(k)) {
      setPathValue(data, k, value);
    } else if (typeof data[k] !== 'object') {
      data[k] = value;
    }
  });
  textKeys.forEach((k) => {
    if (imgKeys.has(k) || codeKeys.has(k)) return;
    const value = exampleMap.has(k) ? exampleMap.get(k) : `{${k}}`;
    if (VAR_PATH_REG.test(k)) {
      // 点路径变量：嵌套写入（与业务真值的嵌套对象/平铺点 key 两种写法均兼容）
      setPathValue(data, k, value);
    } else if (typeof data[k] !== 'object') {
      // 扁平变量平铺写入；同根已由路径构建成对象时跳过（路径优先，见 setPathValue 注释）
      data[k] = value;
    }
  });
  // 图片变量：example（图片 URL）> defaultValue（渲染回退图）> 默认纯色图；
  // 保证示例模式不再丢图（此前无 example 保持不填 → renderObjects 清空 token → 对象被丢弃）
  imgKeys.forEach((k) => {
    if (textKeys.has(k)) return;
    let value;
    if (exampleMap.has(k)) value = exampleMap.get(k);
    else if (defaultValueMap.has(k)) value = defaultValueMap.get(k);
    else value = getDefaultImageSample();
    if (!value) return;
    if (VAR_PATH_REG.test(k)) {
      setPathValue(data, k, value);
    } else if (typeof data[k] !== 'object') {
      data[k] = value;
    }
  });
  return data;
}

/** 已配置判断（标准或旧格式均支持）：卡片 Tag / 舞台浮层显隐 */
export function hasPosterConfig(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (Array.isArray(parsed.objects)) return parsed.objects.length > 0;
  return isLegacyPosterConfig(parsed);
}

// 旧转换器为前台渲染输出，所有对象带不可交互标记（selectable/hasControls/evented…），
// 编辑器加载前须剥离，否则全部图层锁定无法编辑。workspace 画板除外（编辑器自行锁定）。
const INTERACTIVE_LOCK_KEYS = [
  'selectable',
  'hasControls',
  'evented',
  'lockMovementX',
  'lockMovementY',
  'lockRotation',
  'lockScalingX',
  'lockScalingY',
];

/**
 * 剥离对象树的交互锁标记（原地修改；递归覆盖 group 嵌套）。
 * workspace（画板）保留原样——编辑器 WorkspacePlugin 加载时自行锁定。
 */
function stripInteractiveLocks(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.id !== 'workspace') {
    INTERACTIVE_LOCK_KEYS.forEach((k) => delete obj[k]);
  }
  if (Array.isArray(obj.objects)) obj.objects.forEach(stripInteractiveLocks);
}

/**
 * 值（旧格式或标准格式，对象/字符串均可）→ 编辑器可加载的标准 JSON 字符串。
 * 标准格式透传；旧格式经 convertLegacyPoster 转换（异步：含背景/素材测量加载）。
 * 注意（转换器语义）：options.data 提供了值的图片变量会被示例/真实值固化；
 * 已知变量但无值时保留变量图（{{key}} + isVariableImage，渲染期经 data 注入），
 * 文本变量同样保留 {{key}} 模板。后台配置场景传 scopeKeys（变量名）即可完整保留变量；
 * 未传 scopeKeys 时自动从旧数据扫描变量引用兜底（见 extractLegacyVarKeys），降低迁移成本。
 * options.forEditor：编辑器交接用，剥离渲染锁（标准透传与旧格式转换均生效；
 * 标准透传路径剥锁是因为存量懒升级值可能残留旧转换器的 selectable:false）。
 */
export async function convertLegacyToStandard(value, options = {}) {
  if (!value) return '';
  const obj = typeof value === 'string' ? JSON.parse(value) : value;
  if (Array.isArray(obj.objects)) {
    if (options.forEditor) {
      // 深拷贝后剥锁，避免污染入参对象
      const copy = JSON.parse(JSON.stringify(obj));
      copy.objects.forEach(stripInteractiveLocks);
      return JSON.stringify(copy);
    }
    return typeof value === 'string' ? value : JSON.stringify(obj);
  }
  // 无法识别的格式（标量/空对象/其他结构）直接抛错，而不是静默转换出空海报
  if (!isLegacyPosterConfig(obj)) {
    throw new Error('无法识别的海报数据格式（需标准 objects 或旧版 posterConfig）');
  }
  // 未传 scopeKeys 时自动提取变量名；显式传入则完全手动控制（并集可能误升级字面 {token} 文本）
  const scopeKeys =
    options.scopeKeys && options.scopeKeys.length ? options.scopeKeys : extractLegacyVarKeys(obj);
  const m = await import('@/examples/smart-poster/legacy/legacyConverter');
  const json = await m.convertLegacyPoster(obj, { ...options, scopeKeys });
  if (options.forEditor) json.objects.forEach(stripInteractiveLocks);
  return JSON.stringify(json);
}
