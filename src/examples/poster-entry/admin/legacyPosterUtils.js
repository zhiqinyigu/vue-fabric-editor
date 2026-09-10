/*
 * 旧版 posterConfig（course-detail marketConfig.courseXxxPosterConfig 同构）兼容工具
 *
 * 旧格式字段：background / avatarPosition("x,y,size") / nickNamePosition("x,y,color") /
 * qrCodePosition("x,y,size") / text[] / img[] / jsonList[] / mode
 * 标准格式：FabricEditor 导出的 fabric canvas JSON（顶层 objects[]）
 */

/** 旧版 posterConfig 的内容字段（任一非空即视为已配置） */
export const LEGACY_VALUE_FIELDS = [
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
// isVariableImage 图片对象 src 的 {{key}} 为图片变量（不填，渲染期经 data 注入）
function forEachStandardVarKey(obj, onText, onImage) {
  (obj.objects || []).forEach((o) => {
    if (!o || typeof o !== 'object') return;
    forEachDoubleBraceVar(o.text, onText);
    if (o.isVariableImage) forEachDoubleBraceVar(o.src, onImage);
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

/**
 * 未传/缺省 sampleData 时的示例值自动推导（按 key 与外部传入合并，外部优先）。
 * 旧格式：文本变量（text[].text / jsonList obj.text）→ 填 `{key}`（预览显示变量名占位）；
 * 图片变量（img[].src / jsonList obj.src）不填：转换器对有值的图片变量走静态固化，
 * 填 `{key}` 会被当 URL 加载失败导致元素丢弃；不填则保留变量图分支（占位框 + 渲染期拉伸）。
 * 标准 fabric JSON（编辑器保存回传后的值形态）：文本对象 text 中的 {{key}} → 填 `{key}`；
 * isVariableImage 的变量图不填（渲染期经 data 注入），与旧格式语义一致。
 * 同名 key 若同时用于图片，一律不填（避免触发图片静态固化）。
 * 示例值优先级：业务 sampleData（Entry.vue 顶层浅合并覆盖）>
 * variableMeta.schema[].example（编辑器全量导出的海报自带）> 默认 `{key}` 占位。
 * 图片变量一律不填（variableMeta 有示例也不填）：保持变量图分支（占位框 + 渲染期经 data 注入），
 * 避免示例 URL 触发静态固化 / 跨域加载失败被跳过。
 * 点路径变量（如 {course.trainStage.stageIndex}）按嵌套结构写入（见 setPathValue），
 * 扁平变量仍平铺写入；同根扁平与路径冲突时路径优先（扁平 key 已成对象则跳过）。
 * @param {Object|String} config 旧格式对象 / 标准 fabric JSON / JSON 字符串
 * @returns {Object} 示例数据（非旧格式且非标准 objects / 非法 JSON → {}）
 */
export function deriveFallbackSampleData(config) {
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
  const makeCollect = (set) => (key) => {
    const k = String(key).trim();
    if (isVarToken(k) && EXPR_CONTEXT_KEYS.indexOf(k) === -1) set.add(k);
  };
  if (isLegacyPosterConfig(obj)) {
    forEachLegacyVarKey(obj, makeCollect(textKeys), makeCollect(imgKeys));
  } else if (obj && typeof obj === 'object' && Array.isArray(obj.objects)) {
    forEachStandardVarKey(obj, makeCollect(textKeys), makeCollect(imgKeys));
  } else {
    return {};
  }
  // variableMeta.schema 示例值（编辑器全量导出自带；精简导出仅 {path, defaultValue}
  // 无 example，天然退占位——defaultValue 回退由渲染端 applySchemaDefaults 处理）
  const exampleMap = new Map();
  const schema =
    obj && obj.variableMeta && Array.isArray(obj.variableMeta.schema)
      ? obj.variableMeta.schema
      : [];
  schema.forEach((d) => {
    if (!d || typeof d.path !== 'string') return;
    const key = d.path.trim();
    if (!key || d.example == null || d.example === '') return;
    exampleMap.set(key, String(d.example));
  });

  const data = {};
  textKeys.forEach((k) => {
    if (imgKeys.has(k)) return;
    const value = exampleMap.has(k) ? exampleMap.get(k) : `{${k}}`;
    if (VAR_PATH_REG.test(k)) {
      // 点路径变量：嵌套写入（与业务真值的嵌套对象/平铺点 key 两种写法均兼容）
      setPathValue(data, k, value);
    } else if (typeof data[k] !== 'object') {
      // 扁平变量平铺写入；同根已由路径构建成对象时跳过（路径优先，见 setPathValue 注释）
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

/**
 * 渲染后布局旧版标记对象（头像圆形裁切 / 变量图拉伸到配置框）。
 * 动态加载转换器（含 fabric，重依赖），供渲染完成钩子调用。
 * @param {Object} canvas fabric canvas
 * @returns {Boolean} 是否有对象被布局
 */
export async function layoutLegacyImages(canvas) {
  if (!canvas) return false;
  const m = await import('@/examples/smart-poster/legacy/legacyConverter');
  return m.layoutLegacyImages(canvas);
}
