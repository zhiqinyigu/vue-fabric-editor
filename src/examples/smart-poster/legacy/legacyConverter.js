/*
 * 旧版 posterConfig → 新 fabric canvas JSON 转换器
 * （替代旧 fabric-poster.vue 的前置渲染层，供前台用户端渲染存量海报）
 *
 * 数据版本判定（config.mode 字段 + 字段特征推断）：
 *   旧版（new）：config.mode === 'new'，或无 mode 字段但含 config.imgs / config.jsonList
 *   旧旧版（old）：config.mode === 'old'，或无 mode 字段且不含 config.imgs / config.jsonList
 *
 * - 输入：后台保存的旧配置（两代字段名均兼容）：
 *   background / backgroundColor / avatar|avatarPosition /
 *   nickname|nickNamePosition / qrcode|qrCodePosition /
 *   texts|text[] / imgs|img[] / jsonList[]
 * - 输出：新渲染器（FabricRenderer / RendererCore）可直接加载的 fabric JSON
 *   （workspace + backgroundImage + 各类元素 + variableMeta）
 * - 变量：旧 `{key}` 仅在"已知变量"（由 data / scopeKeys 提供）时转成 `{{key}}`，
 *   未知名面字量保持原样（与旧 templateStringEvaluation 语义一致）。
 *   "已知"含点路径表达式（如 `{course.trainStage.stageIndex}`）：旧引擎经 parseExp
 *   按点路径取值，这里同样先精确 key、再逐级路径解析（与渲染器 getValueByPath 同语义），
 *   可解析即视为已知，交给渲染器运行时取值
 * - 对齐：仅 splitByGrapheme（固定宽度换行盒）下 align 生效为盒内 textAlign；
 *   splitByGrapheme=false 时旧引擎恒以左边缘为锚点，align 一律按 left 处理
 *   （不写 textAlign、不映射 originX，x 恒为文本左边缘），详见文本转换段注释
 * - 隐藏坐标：头像/昵称/二维码的 x/y 任一 ≥ 8000 视为移出海报可视区域（涵盖旧约定 9999
 *   与运营实际填写的 '9999,9999'），转换时直接丢弃该元素
 * - 头像框缺省：
 *   旧旧版（old 或无 mode 且无 imgs/jsonList）：avatarPosition 仅 "x,y" 两段时按默认方形框
 *     45*calculateRatio(背景宽)（旧版代码 avatarWidth = 45*ratio 同源）
 *   旧版（new 或无 mode 但含 imgs/jsonList）：缺第三段仍不展示（需显式第三段才显示）
 *   任何情况下第三段显式 0 都按旧约定视为不展示
 * - 头像按标准变量图输出（src '{{avatar}}' + isVariableImage，与昵称同语义）：转换期不依赖
 *   data.avatar，各用户头像由渲染期 renderObjects 按 scope 注入；编辑器变量预览与渲染端
 *   variableImageFit 两端原生"按版位拉伸铺满"，无需渲染后布局。满框圆 clipPath（编辑器
 *   序列化形态：absolutePositioned:false + origin center + rx=box/2）纯按 json 圆切，圆形
 *   可再编辑/移除；非方源头像为等比拉伸（与编辑器一致），不复刻旧引擎 min 边裁切
 * - 文本基线（canvasTextBaseline）：
 *   旧版（new 或无 mode 但含 imgs/jsonList）：canvasTextBaseline 一律视为 hanging，y 即盒顶
 *   旧旧版（old 或无 mode 且无 imgs/jsonList）：canvasTextBaseline='alphabetic'（或字段缺失时
 *     视为 alphabetic）时 y 是文本基线而非盒顶，自动宽度单行文本 top 修正为 y - fontSize*0.94
 *     （fabric 渲染基线偏移）；仅显式 hanging 时 y 即盒顶不动
 *   split 固定尺寸盒 y 恒为盒顶；昵称同单行文本规则
 * - 每用户动态取值（分享链接 / 昵称 / 头像等）由消费方经 data/scope 注入，本模块只做几何与标记。
 */
import { appendCacheBustParam } from '@/lib/renderer';
import { loadImageResilient } from '@/core/imageLoader';
import {
  DEFAULT_DELIMITER,
  extractVariablesFromString,
  getByPath,
  getVariableFieldOfObject,
} from '@/core/variableEngine';

// 旧昵称字号比例：把海报宽度分成若干段，使每段落在 (minW, maxW) 内
export function calculateRatio(width, maxW = 380, minW = 150) {
  let i = 1;
  while (width > minW && !(width / i > minW && width / i < maxW)) {
    i++;
  }
  return i;
}

const DEFAULT_NICKNAME_FONT_SIZE = (posterWidth) => 12 * calculateRatio(posterWidth);

// 头像框缺省尺寸（avatarPosition 只有 "x,y" 两段时）：45 * calculateRatio(背景宽)，
// 与旧版代码同源——`const ratio = calculateRatio(bg.width); const avatarWidth = 45*ratio;`
const DEFAULT_AVATAR_BOX_SIZE = (posterWidth) => 45 * calculateRatio(posterWidth);

const DEFAULT_FONT_FAMILY = 'Arial, sans-serif, Microsoft YaHei';

// 旧业务约定：头像/昵称/二维码的 x/y 任一 ≥ 8000 表示"移出海报可视区域不显示"
//（覆盖旧约定 9999 与运营实际填写的 '9999,9999' 隐藏坐标），转换时直接丢弃该元素
//（不出现在输出对象里，而非留在画布外成为死元素）
const OFFSCREEN_COORD_LIMIT = 8000;

function isOffscreenPosition(x, y) {
  return Number(x) >= OFFSCREEN_COORD_LIMIT || Number(y) >= OFFSCREEN_COORD_LIMIT;
}

// fabric i-text/textbox 渲染基线偏移：字体盒高 = fontSize * 0.94（fabric Text._fontSizeMult），
// 行 0 的 alphabetic 基线相对盒顶即 fontSize * 0.94。
// 旧引擎 canvasTextBaseline='alphabetic' 时数据 y 是文本基线而非盒顶，须把盒顶上移
// fontSize * 0.94，使 fabric 渲染出的可见基线精确落回旧 y（lineHeight 不影响行 0 基线）。
//
// 模式判定：config.mode 有显式值时直接取（'old' → 旧旧版，'new' → 旧版）；无 mode 字段时，
// 含 config.imgs / config.jsonList 推断为旧版（new），否则为旧旧版（old）。
//   旧版（new）：canvasTextBaseline 一律视为 hanging，y 即盒顶，不补偿
//   旧旧版（old）：canvasTextBaseline='alphabetic'（或字段缺失时视为 alphabetic）时 y 是基线
//     → 需补偿；仅显式 hanging → y 即盒顶
const FABRIC_TEXT_BASELINE_OFFSET = 0.94;
const isOldLegacyMode = (config) =>
  config.mode === 'old' || (config.mode === undefined && !config.imgs && !config.jsonList);
const isAlphabeticBaseline = (config) =>
  isOldLegacyMode(config) &&
  (config.canvasTextBaseline == null || config.canvasTextBaseline === 'alphabetic');
const alphabeticTop = (y, fontSize) =>
  Number(y || 0) - (Number(fontSize) || 0) * FABRIC_TEXT_BASELINE_OFFSET;

// 二维码默认参数：复刻旧版视觉（码点铺满 qrCodePosition 配置框，实心方块模块）
// 注意：不要照抄编辑器 QrCodePlugin 默认值（margin 10 + rounded 点型会使
// 码点区域缩水约 18%：213 框 → 213-2*10 静区 → floor 取整居中 → 仅 ~82%）
export const QR_DEFAULTS = {
  width: 300,
  margin: 0,
  errorCorrectionLevel: 'M',
  dotsColor: '#000000',
  dotsType: 'square',
  cornersSquareColor: '#000000',
  cornersSquareType: 'square',
  cornersDotColor: '#000000',
  cornersDotType: 'square',
  background: '#ffffff',
};

// 默认图片加载器（取自然尺寸；与渲染器相同 crossOrigin 策略）。
// 用 loadImageResilient（CORS 失败自动去 crossOrigin 重试）而非裸 fabric.util.loadImage：
// 转换在预览/交接等场景可能早于 RendererCore/Editor 挂载，回退包装尚未安装，
// 裸加载在无 Access-Control-* 头的 CDN 上必然失败 → 背景测量失败被整个丢掉（不再生成 backgroundImage）
// 且触发"部分图片加载失败"二级警告；resilient 任何调用点都自带回退，不依赖 wrapping 时序。
function defaultImageLoader(src, cb) {
  loadImageResilient(src, { crossOrigin: 'anonymous' })
    .then((img) => cb(img, false))
    .catch(() => cb(null, true));
}

function loadImage(src, loader) {
  return new Promise((resolve, reject) => {
    loader(src, (img, isError) => {
      if (isError || !img) {
        reject(new Error('图片加载失败：' + src));
      } else {
        resolve(img);
      }
    });
  });
}

// 估算单行文本宽度（无背景海报的包围盒兜底；ASCII≈0.55 字号，全角≈1）
function estimateTextWidth(text, fontSize) {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    units += text.charCodeAt(i) > 255 ? 1 : 0.55;
  }
  return units * fontSize;
}

// 计算元素包围盒的右/下边界（旧 calculateCanvasSize 语义：画布从 (0,0) 起）
function computeBoundingBox(objects) {
  let right = 0;
  let bottom = 0;
  objects.forEach((o) => {
    if (!o) return;
    const w =
      o.type === 'text' || o.type === 'i-text'
        ? estimateTextWidth(String(o.text || ''), Number(o.fontSize) || 12)
        : Number(o.width) || 0;
    const h = Number(o.height) || 0;
    const sx = Number(o.scaleX) || 1;
    const sy = Number(o.scaleY) || 1;
    const left = Number(o.left) || 0;
    const top = Number(o.top) || 0;
    right = Math.max(right, left + w * sx);
    bottom = Math.max(bottom, top + h * sy);
  });
  return { right, bottom };
}

// 单花括号变量替换：匹配 {key} 且跳过 {{ }} 双括号（onMatch 返回替换值，返回 m 保持原样）。
// 不用 lookbehind（(?<!{)）：iOS Safari 16.4 之前不支持，正则字面量在解析期即抛
// "Invalid regular expression: invalid group specifier name"，导致整个模块加载失败。
function replaceSingleBraceVars(text, onMatch) {
  return text.replace(/\{([^{}]+)\}/g, (m, key, offset) => {
    if (text[offset - 1] === '{' || text[offset + m.length] === '}') return m;
    return onMatch(m, key);
  });
}

// 按点路径取值：优先精确匹配完整路径作为顶层 key，其次逐级点路径解析。
// 与渲染器 getValueByPath 同语义（own-property 校验防原型链访问），保证
// 转换期判定与渲染期取值不会对同一个表达式产生分歧。
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

// 变量替换（文本）：`{key}` → `{{key}}`，仅替换"已知"key（knownKeys 命中，或可从 data
// 按点路径解析，如 {course.trainStage.stageIndex}，复刻旧引擎 parseExp 路径语义）
function convertVars(text, knownKeys, data) {
  if (typeof text !== 'string') return text;
  return replaceSingleBraceVars(text, (m, key) =>
    knownKeys.has(key) || getPathValue(data, key) !== undefined ? `{{${key}}}` : m
  );
}

// 变量取值（src）：`{key}` → data 中的实际值（精确 key 或点路径），仅替换已知 key
// （与旧 templateStringEvaluation 一致）
function resolveTemplateValue(text, data, knownKeys) {
  if (typeof text !== 'string') return text;
  return replaceSingleBraceVars(text, (m, key) => {
    if (!knownKeys.has(key) && getPathValue(data, key) === undefined) return m;
    const v = knownKeys.has(key) ? data[key] : getPathValue(data, key);
    return v == null ? '' : String(v);
  });
}

// 占位字段 → 变量类型（与库内 inferVariableType 的字段映射一致）
const FIELD_TYPE_MAP = {
  text: 'text',
  src: 'image',
  'extension.data': 'qrcode',
  'extension.value': 'barcode',
};

// 字段级变量扫描（与编辑器 VariablePlugin.getVariableEntries 同一规则）：
// 遍历对象树（递归 group.objects），按对象形态确定可变量字段
// （text/src/extension.data/extension.value，含背景图与二维码/条形码扩展字段），
// 提取 {path, field} 并按 path 去重（首见 field 为准）。供 variableMeta.schema 组装 type 使用
function scanVariableEntries(json) {
  const map = new Map();
  const collect = (objects) => {
    (Array.isArray(objects) ? objects : []).forEach((obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj.objects)) {
        collect(obj.objects);
        return;
      }
      getVariableFieldOfObject(obj).forEach((field) => {
        const value = getByPath(obj, field);
        if (typeof value !== 'string') return;
        extractVariablesFromString(value, DEFAULT_DELIMITER).forEach((path) => {
          if (!map.has(path)) map.set(path, field);
        });
      });
    });
  };
  if (json && Array.isArray(json.objects)) collect(json.objects);
  return Array.from(map, ([path, field]) => ({ path, field }));
}

// 旧数据表达式字段（复刻旧 fabric-poster.vue 的 resolveObjExpression + evaluateExpression）：
// image 对象的字段值整体形如 `{expr}` 时（如 width: "{naturalWidth}"、scaleX: "{150/naturalWidth}"），
// 先解析 src 变量并加载图片，再以 { naturalWidth, naturalHeight } 为上下文执行 JS 表达式，
// 覆盖 width/height/scaleX/scaleY/clipPath 等字段，递归 group 与 clipPath 子对象。
// 未求值的字符串尺寸会让 fabric drawImage 收到 NaN 而静默跳过绘制（元素不可见）。
const EXP_REG = /^\s*\{([\S\s]+)\}\s*$/;

function evaluateExpression(expression, context) {
  const keys = Object.keys(context);
  const values = keys.map((key) => context[key]);
  const func = new Function(...keys, `return ${expression};`);
  return func(...values);
}

function pickExpressions(obj, queue) {
  Object.keys(obj).forEach((key) => {
    if (key === 'src' || key === 'text') return;
    const v = obj[key];
    if (typeof v === 'string' && EXP_REG.test(v)) {
      queue.push({ holder: obj, key, expr: EXP_REG.exec(v)[1] });
    } else if (v && typeof v === 'object') {
      pickExpressions(v, queue);
    }
  });
}

// 返回 false 表示对象无法求值（src 未解析/加载失败），调用方应丢弃该对象
async function applyLegacyExpressions(obj, imageLoader, cacheBust, onWarn) {
  if (!obj || typeof obj !== 'object') return true;
  const children = Array.isArray(obj) ? obj : obj.objects;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (!(await applyLegacyExpressions(child, imageLoader, cacheBust, onWarn))) return false;
    }
  }
  if (Array.isArray(obj) || obj.type !== 'image') return true;
  const queue = [];
  pickExpressions(obj, queue);
  if (!queue.length) return true;
  const src = String(obj.src || '');
  if (!src || src.indexOf('{') !== -1) {
    console.warn('[legacyConverter] 表达式图片 src 未解析，跳过：', src);
    return false;
  }
  try {
    // 测量加载与 bg/img 一致追加分片参数（该 CDN 按 feDomain 返回 CORS 头）
    const img = await loadImage(appendCacheBustParam(src, cacheBust), imageLoader);
    const ctx = {
      naturalWidth: img.naturalWidth || img.width || 0,
      naturalHeight: img.naturalHeight || img.height || 0,
    };
    queue.forEach(({ holder, key, expr }) => {
      holder[key] = evaluateExpression(expr, ctx);
    });
    return true;
  } catch (e) {
    console.warn('[legacyConverter] 表达式图片加载失败，跳过：', src, e && e.message);
    if (onWarn) onWarn(src);
    return false;
  }
}

// 旧 fabric 对象 → 新渲染器契约的字段兼容层（集中收敛点）
// 旧存量 JSON（fabric 3.6.6 原生序列化）与新自定义对象（CustomRect 等）存在字段表达差异，
// 所有"旧字段 → 新字段"的映射规则集中在此函数，便于维护与扩展。
function normalizeLegacyObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  // rect 圆角：旧 fabric 用 rx/ry 作为输入参数；新 CustomRect._render 只认 roundValue
  // （按 scaleX/scaleY 反算 rx/ry，使放缩下视觉圆角不变）。映射后两者并存：
  // roundValue 供 CustomRect 渲染，rx/ry 保留供纯 fabric 环境解析。
  if (obj.type === 'rect' && obj.roundValue == null && (Number(obj.rx) > 0 || Number(obj.ry) > 0)) {
    obj.roundValue = Number(obj.rx) || Number(obj.ry);
  }
  return obj;
}

// 渲染器未注册的旧自定义类型/字段归一化（递归，覆盖嵌套 group）：
// - ellipsis-textbox：渲染器未注册该类型，loadFromJSON 会报 `fabric[obj.type]` 为 undefined
//   （Cannot read properties of undefined (reading 'fromObject')）；转成 textbox + 尺寸锁/省略号。
//   其 clipPath 即"尺寸锁框"本身，与 clipEnabled/frameHeight 完全重叠；且渲染器覆写的
//   Textbox.fromObject 不 enliven clipPath，保留普通对象会在渲染期触发
//   `e.shouldCache is not a function`（_drawClipPath）。尺寸锁已复刻裁剪，直接删除。
// - textbox 上的 clipPath：渲染器对 Textbox.fromObject 的覆写同样不 enliven clipPath，
//   任意 textbox 残留普通对象 clipPath 都会在渲染期崩溃，统一删除（非尺寸锁场景仅损失裁剪，不报错）。
function normalizeObjectTree(obj) {
  if (!obj || typeof obj !== 'object') return;
  // 旧编辑器自定义 ellipsis-textbox：渲染器未注册该类型，loadFromJSON 会报
  // `fabric[obj.type]` 为 undefined；转成 textbox + 尺寸锁/省略号（与上方 text[] 复刻语义一致）
  // 并删除其 clipPath（尺寸锁已复刻裁剪，且渲染器不 enliven 会触发 shouldCache 报错）。
  if (obj.type === 'ellipsis-textbox') {
    obj.type = 'textbox';
    obj.splitByGrapheme = true;
    const frameH = Number(obj.height) || 0;
    if (frameH > 0) {
      obj.clipEnabled = true;
      obj.frameHeight = frameH;
      obj.ellipsisEnabled = true;
      obj.height = frameH;
    }
    delete obj.clipPath;
  } else if (obj.type === 'textbox' && obj.clipPath) {
    delete obj.clipPath;
  } else if (obj.type === 'text') {
    // fabric.Text（type:'text'）无 inline editing，编辑器属性面板只匹配 i-text/textbox；
    // 转 i-text 让旧数据文本可在编辑器里编辑、同时变量引擎包含 'text' 字段
    obj.type = 'i-text';
  }
  if (Array.isArray(obj.objects)) {
    obj.objects.forEach(normalizeObjectTree);
  }
}

/**
 * 标准 fabric JSON（FabricEditor 导出）归一化：把渲染器不支持的旧自定义类型映射为渲染器契约。
 * 直接透传给 FabricRenderer 前调用（原地修改，调用方需自行深拷贝以避免污染共享配置）。
 */
export function normalizeStandardJson(json) {
  if (!json || !Array.isArray(json.objects)) return json;
  json.objects.forEach(normalizeObjectTree);
  return json;
}

/**
 * 转换旧配置为新的 fabric canvas JSON
 * @param {Object} posterConfig 后台保存的旧数据
 * @param {Object} [options]
 *   - data: 已解析的变量值（scope + avatar + $posterQrcode …）
 *   - scopeKeys: 额外已知变量名（与 data keys 取并集），决定 {key} -> {{key}}
 *   - nicknameFontSize: (posterWidth)=>px，默认 12 * calculateRatio(posterWidth)
 *   - qrImage: 可选预生成二维码图片 dataURL（旧 shareCode），优先于 extension.data
 *   - imageLoader: 自定义图片加载器 (src, cb(img, isError))，默认 fabric.util.loadImage
 * @returns {Promise<Object>} fabric canvas JSON
 */
export async function convertLegacyPoster(posterConfig, options = {}) {
  const config = posterConfig || {};
  const data = options.data || {};
  const scopeKeys = Array.isArray(options.scopeKeys) ? options.scopeKeys : [];
  const knownKeys = new Set([
    ...Object.keys(data),
    ...scopeKeys,
    'nickname',
    'avatar',
    // $posterQrcode：二维码图片（旧 scope 语义，jsonList 内 {$posterQrcode} 引用）
    // $posterShareUrl：分享链接（动态二维码内容）
    '$posterQrcode',
    '$posterShareUrl',
  ]);
  const nicknameFontSize =
    typeof options.nicknameFontSize === 'function'
      ? options.nicknameFontSize
      : DEFAULT_NICKNAME_FONT_SIZE;
  const imageLoader =
    typeof options.imageLoader === 'function' ? options.imageLoader : defaultImageLoader;
  const qrImage = options.qrImage || '';
  // 图片加载失败（跨域/404 等非致命丢图）回调，供消费方显示二级警告；其余跳过不回调
  const onWarn = typeof options.onWarn === 'function' ? options.onWarn : null;
  const warnImageLoadFail = (src) => {
    if (onWarn) onWarn(src);
  };
  // 「按接入域名分片缓存」配置：undefined→默认 feDomain=location.hostname；false→关闭；{ param, getValue }→自定义
  const cacheBust = options.cacheBust;
  const configW = Number(config.width) || 0;
  const configH = Number(config.height) || 0;

  // 背景图（决定海报尺寸；加载失败则退回配置尺寸/包围盒）
  let bgSize = null;
  if (config.background) {
    // 转换期的背景测量加载也是真实请求：URL 追加分片参数，与渲染期 loadJSON 追加同一 shard，
    // 避免 CDN 按域名分片缓存被绕过；JSON 中 src 保持干净 URL，渲染期由 loadJSON 幂等重追加。
    const bgRequestUrl = appendCacheBustParam(config.background, cacheBust);
    try {
      const img = await loadImage(bgRequestUrl, imageLoader);
      bgSize = { w: img.naturalWidth || img.width || 0, h: img.naturalHeight || img.height || 0 };
    } catch (e) {
      console.warn('[legacyConverter] 背景图加载失败，忽略：', config.background, e && e.message);
      warnImageLoadFail(config.background);
    }
  }
  // 昵称字号比例只取"背景图宽 / 配置宽"（与旧渲染一致，不用包围盒）
  const posterWidth = bgSize && bgSize.w > 0 ? bgSize.w : configW;

  const objects = [];

  // 1) 头像（标准变量图 + 满框圆 clipPath，纯 json 闭环：编辑器/渲染端按原生机制消费）
  // 框尺寸语义：第三段显式数字沿用旧约定（0 = 不显示头像）；旧旧版（无 mode 且无
  // imgs/jsonList，或 mode === 'old'）两段式（"x,y" 无第三段）框缺省 → 默认方形框
  // 45*calculateRatio(背景宽)（见 DEFAULT_AVATAR_BOX_SIZE）；旧版（mode === 'new' 或
  // 无 mode 但含 imgs/jsonList）缺第三段仍不展示（保持旧引擎 createAvatar 需要 avatarConfig[2]）
  const avatarCfg = String(config.avatarPosition || config.avatar || '')
    .split(',')
    .map((s) => Number(s));
  const avatarBox = Number.isFinite(avatarCfg[2])
    ? avatarCfg[2]
    : isOldLegacyMode(config)
    ? DEFAULT_AVATAR_BOX_SIZE(posterWidth)
    : 0;
  if (
    avatarBox > 0 &&
    Number.isFinite(avatarCfg[0]) &&
    Number.isFinite(avatarCfg[1]) &&
    !isOffscreenPosition(avatarCfg[0], avatarCfg[1])
  ) {
    objects.push({
      type: 'image',
      id: 'legacy-avatar',
      src: '{{avatar}}',
      // 标准变量图（isVariableImage）：编辑器变量预览与渲染端 variableImageFit 两端原生
      // "按版位（width×scale）拉伸铺满真实图"，无需渲染后布局；设计态为占位图+变量名
      isVariableImage: true,
      left: avatarCfg[0],
      top: avatarCfg[1],
      width: avatarBox,
      height: avatarBox,
      // 满框圆 clipPath：编辑器序列化形态（absolutePositioned:false + origin center + 局部半径），
      // 两端纯按 json 出圆切，圆形可再编辑/可移除（编辑器原生裁切语义）；
      // 非方源头像为等比拉伸（与编辑器/渲染端一致），不支持旧引擎 min 边裁切
      clipPath: {
        type: 'ellipse',
        absolutePositioned: false,
        originX: 'center',
        originY: 'center',
        rx: avatarBox / 2,
        ry: avatarBox / 2,
      },
      selectable: false,
      hasControls: false,
      crossOrigin: 'anonymous',
    });
  }

  // 2) 昵称
  const nickCfg = String(config.nickNamePosition || config.nickname || '')
    .split(',')
    .filter((s) => s !== '');
  if (nickCfg.length && !isOffscreenPosition(nickCfg[0], nickCfg[1])) {
    const nickFontSize = nicknameFontSize(posterWidth);
    objects.push({
      type: 'i-text',
      id: 'legacy-nickname',
      text: '{{nickname}}',
      left: Number(nickCfg[0]) || 0,
      // alphabetic 时 y 是基线 → 上移 fontSize * 0.94；hanging/缺省 y 即盒顶
      top: isAlphabeticBaseline(config)
        ? alphabeticTop(nickCfg[1], nickFontSize)
        : Number(nickCfg[1]) || 0,
      fill: nickCfg[2] || '#000000',
      fontSize: nickFontSize,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontWeight: 'normal',
      selectable: false,
      hasControls: false,
    });
  }

  // 3) 文本（splitByGrapheme+height → 尺寸锁 + 省略号，复刻旧 EllipsisTextbox）
  const alphaBaseline = isAlphabeticBaseline(config);
  (config.text || config.texts || []).forEach((item, i) => {
    if (!item) return;
    const split = !!item.splitByGrapheme;
    const tWidth = Number(item.width) || 0;
    const tHeight = Number(item.height) || 0;
    const fSize = Number(item.size) || 12;
    const textObj = {
      type: split ? 'textbox' : 'i-text',
      id: `legacy-text-${i}`,
      text: convertVars(String(item.text != null ? item.text : ''), knownKeys, data),
      left: Number(item.x) || 0,
      // alphabetic 时 y 是基线 → 自动宽度单行文本上移 fontSize * 0.94；
      // split 固定尺寸盒的 y 是文本块顶部（剪辑框锚在盒顶），维持不动
      top: !split && alphaBaseline ? alphabeticTop(item.y, fSize) : Number(item.y) || 0,
      fill: item.color || '#000000',
      fontSize: fSize,
      fontFamily: DEFAULT_FONT_FAMILY,
      selectable: false,
      hasControls: false,
    };
    if (item.fontWeight) textObj.fontWeight = item.fontWeight;
    if (item.lineHeight) textObj.lineHeight = Number(item.lineHeight);
    // 旧引擎语义：只有 splitByGrapheme（固定宽度换行盒）下 align 才生效，作为盒内 textAlign。
    // splitByGrapheme=false 时旧对象是 fabric.Text（originX:'left'，盒宽=最长行宽），x 恒为文本
    // 左边缘、align 不产生任何位移——一律按 left 处理：不写 textAlign、不映射 originX。
    // （旧数据大量存在 align:'center' 但 splitByGrapheme:false 的配置，若映射 originX 会把文本
    //  整体平移半个宽度，与旧渲染不符。变量替换后重测宽也与该左锚点语义无关。）
    if (split && item.align) textObj.textAlign = item.align;
    if (split) {
      textObj.splitByGrapheme = true;
      textObj.width = tWidth || 200;
      if (tHeight) {
        textObj.clipEnabled = true;
        textObj.frameHeight = tHeight;
        textObj.ellipsisEnabled = true;
        textObj.height = tHeight;
      }
    }
    objects.push(textObj);
  });

  // 4) 图片：
  //    - src 整体形如 {key} 且 key 已知：有值 → 按静态图处理（测量固化，前台渲染场景，行为不变）；
  //      无值（后台配置预览/编辑场景）→ 标准变量图元素
  //      （{{key}} + isVariableImage，width/height=配置框）：渲染期经 data 注入真实地址后，
  //      编辑器变量预览与渲染端 variableImageFit 两端原生"按版位独立轴拉伸铺满"，
  //      与旧 drawImage 的 dw/dh 非等比拉伸语义逐字段等价（scale = box/natural），无需渲染后布局。
  //    - 静态 src：转换期加载取自然尺寸 → scaleX/scaleY；含未解析变量则跳过
  const imgItems = [];
  const wholeVarReg = /^\s*\{([^{}]+)\}\s*$/;
  for (const item of config.img || config.imgs || []) {
    if (!item || !item.src) continue;
    const raw = String(item.src);
    const boxW = Number(item.width) || 0;
    const boxH = Number(item.height) || 0;
    const wholeVar = wholeVarReg.exec(raw);
    const wholeKey = wholeVar && wholeVar[1].trim();
    // 已知（精确 key 或点路径可解析）且转换期取不到值 → 变量图元素，渲染期经 {{key}} 注入；
    // 已知且取得到值 → 直接烘焙静态 src（原行为）。语义与原平铺逻辑逐态等价
    const wholeKnown =
      wholeKey != null && (knownKeys.has(wholeKey) || getPathValue(data, wholeKey) !== undefined);
    const wholeValue =
      wholeKey != null && knownKeys.has(wholeKey)
        ? data[wholeKey]
        : wholeKey != null
        ? getPathValue(data, wholeKey)
        : undefined;
    if (wholeVar && wholeKnown && !wholeValue) {
      const key = wholeKey;
      imgItems.push({
        type: 'image',
        id: `legacy-img-${imgItems.length}`,
        src: `{{${key}}}`,
        isVariableImage: true,
        left: Number(item.x) || 0,
        top: Number(item.y) || 0,
        width: boxW,
        height: boxH,
        selectable: false,
        hasControls: false,
        crossOrigin: 'anonymous',
      });
      continue;
    }
    const src = resolveTemplateValue(raw, data, knownKeys);
    if (src.indexOf('{') !== -1) {
      console.warn('[legacyConverter] 图片 src 含未解析变量，跳过：', item.src);
      continue;
    }
    try {
      // 素材图测量加载同样追加分片参数（真实请求）；JSON src 保持干净，渲染期由 loadJSON 幂等重追加
      const img = await loadImage(appendCacheBustParam(src, cacheBust), imageLoader);
      const nw = img.naturalWidth || img.width || 0;
      const nh = img.naturalHeight || img.height || 0;
      if (!nw || !nh) continue;
      const tW = Number(item.width) || nw;
      const tH = Number(item.height) || nh;
      imgItems.push({
        type: 'image',
        id: `legacy-img-${imgItems.length}`,
        src,
        left: Number(item.x) || 0,
        top: Number(item.y) || 0,
        width: nw,
        height: nh,
        scaleX: tW / nw,
        scaleY: tH / nh,
        selectable: false,
        hasControls: false,
        crossOrigin: 'anonymous',
      });
    } catch (e) {
      console.warn('[legacyConverter] 素材图加载失败，跳过：', src, e && e.message);
      warnImageLoadFail(src);
    }
  }
  objects.push(...imgItems);

  // 5) 二维码
  const qrCfg = String(config.qrCodePosition || config.qrcode || '')
    .split(',')
    .map((s) => Number(s));
  if (qrCfg[2] && !isOffscreenPosition(qrCfg[0], qrCfg[1])) {
    const w = qrCfg[2];
    if (qrImage) {
      // 消费方已提供预生成二维码图片（旧 shareCode）
      // fabric.Image 的 width/height 是源图裁剪区而非显示尺寸，须按自然尺寸 + scaleX/scaleY
      // 缩放到框大小；直接写 width/height = w 会把码裁剪放大成框的一角。测量失败时
      // 退回旧写法（自然尺寸等于框尺寸时两者等价，行为不变）。
      let qrObj = {
        type: 'image',
        id: 'legacy-qrcode',
        src: qrImage,
        left: qrCfg[0],
        top: qrCfg[1],
        width: w,
        height: w,
        selectable: false,
        hasControls: false,
        crossOrigin: 'anonymous',
      };
      try {
        // 测量加载与 bg/img 一致追加分片参数：该 CDN 按 feDomain 返回 CORS 头，
        // 裸 URL 的 crossOrigin 请求会被拒，导致测量失败退回框尺寸；JSON src 保持干净
        const img = await loadImage(appendCacheBustParam(qrImage, cacheBust), imageLoader);
        const nw = img.naturalWidth || img.width || 0;
        const nh = img.naturalHeight || img.height || 0;
        if (nw > 0 && nh > 0) {
          qrObj = {
            ...qrObj,
            width: nw,
            height: nh,
            scaleX: w / nw,
            scaleY: w / nh,
          };
        }
      } catch (e) {
        console.warn('[legacyConverter] 二维码图片测量加载失败，退回框尺寸：', e && e.message);
        warnImageLoadFail(qrImage);
      }
      objects.push(qrObj);
    } else {
      objects.push({
        type: 'image',
        id: 'legacy-qrcode',
        extensionType: 'qrcode',
        // 动态二维码内容是分享链接（$posterQrcode 是二维码图片，见 LegacyFabricRenderer）
        extension: { ...QR_DEFAULTS, width: w, data: '{{$posterShareUrl}}' },
        left: qrCfg[0],
        top: qrCfg[1],
        width: w,
        height: w,
        selectable: false,
        hasControls: false,
      });
    }
  }

  // 6) jsonList：按 moveTo 原位插入（保 Z 序，复刻旧数组拼接顺序）
  for (let i = 0; i < (config.jsonList || []).length; i++) {
    const item = config.jsonList[i];
    if (!item || !item.json) continue;
    let obj;
    try {
      obj = JSON.parse(item.json);
    } catch (e) {
      console.warn('[legacyConverter] jsonList JSON 解析失败，跳过：', i, e && e.message);
      continue;
    }
    if (typeof obj.text === 'string') obj.text = convertVars(obj.text, knownKeys, data);
    if (typeof obj.src === 'string') obj.src = resolveTemplateValue(obj.src, data, knownKeys);
    // 旧编辑器自定义 ellipsis-textbox：渲染器未注册该类型，loadFromJSON 会报
    // `fabric[obj.type]` 为 undefined；转成 textbox + 尺寸锁/省略号（与上方 text[] 复刻语义一致）
    // 并删除其 clipPath（尺寸锁已复刻裁剪，且渲染器不 enliven 会触发 shouldCache 报错）。
    // normalizeObjectTree 递归处理，兼容 jsonList 内嵌套 group 的场景。
    normalizeObjectTree(obj);
    obj.id = obj.id || `legacy-json-${i}`;
    if (obj.selectable === undefined) obj.selectable = false;
    if (obj.hasControls === undefined) obj.hasControls = false;
    obj = normalizeLegacyObject(obj);
    // 旧数据 image 字段支持 {表达式}（以图片自然尺寸为上下文求值），复刻旧渲染引擎；
    // 无法求值（src 未解析/加载失败）时丢弃该对象，避免字符串尺寸导致元素静默不可见
    if (!(await applyLegacyExpressions(obj, imageLoader, cacheBust, onWarn))) continue;
    const idx =
      item.moveTo !== '' && !isNaN(Number(item.moveTo)) ? Number(item.moveTo) : objects.length;
    objects.splice(Math.max(0, Math.min(idx, objects.length)), 0, obj);
  }

  // 7) 海报尺寸：背景图自然尺寸 > 配置 width/height > 元素包围盒
  let W = 0;
  let H = 0;
  if (bgSize && bgSize.w > 0) {
    W = bgSize.w;
    H = bgSize.h;
  } else if (configW > 0 && configH > 0) {
    W = configW;
    H = configH;
  }
  if (!W || !H) {
    const box = computeBoundingBox(objects);
    W = Math.max(W, box.right);
    H = Math.max(H, box.bottom);
  }

  // 8) workspace 与背景图置于最底（与旧渲染层级一致）
  objects.unshift({
    type: 'rect',
    id: 'workspace',
    left: 0,
    top: 0,
    width: W,
    height: H,
    fill: config.backgroundColor || '#ffffff',
    selectable: false,
    evented: false,
    hasControls: false,
    strokeWidth: 0,
  });
  if (bgSize) {
    objects.splice(1, 0, {
      type: 'image',
      id: 'backgroundImage',
      src: config.background,
      left: 0,
      top: 0,
      width: bgSize.w,
      height: bgSize.h,
      backgroundImageMode: 'cover',
      backgroundPosition: { x: 0.5, y: 0.5 },
      opacity: 1,
      selectable: false,
      evented: false,
      hasControls: false,
      crossOrigin: 'anonymous',
    });
  }

  const json = { version: '5.3.0', objects };
  // 变量表（schema 契约）：字段级扫描占位符并按占位字段推断 type；
  // 不带 src 标记（编辑器 hookImportBefore 还原时按 custom 处理，可编辑可删除）；
  // 精简形态由导出方派生（渲染端 resolveRenderSchema 只读 path/defaultValue）
  const entries = scanVariableEntries(json);
  if (entries.length) {
    json.variableMeta = {
      version: 1,
      delimiter: { start: '{{', end: '}}' },
      schema: entries.map(({ path, field }) => ({
        path,
        label: path,
        type: FIELD_TYPE_MAP[field] || 'text',
        example: '',
        defaultValue: '',
        description: '',
      })),
    };
  }
  return json;
}
