/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * fabric 对象序列化默认值表（编辑器与前台渲染器共用）
 *
 * 数据来源：对 fabric 5.3.0 + 项目自定义对象（CustomRect / CustomTextbox）做一次性内省，
 * 取各对象 toObject() 的原始输出（见 tests/unit/_genDefaults.test.js）。
 *
 * 用法：
 * - 编辑器保存 JSON 时按此表剔除"等于默认值"的字段（jsonOptimizer.stripDefaultFields），缩小体积；
 * - 渲染器/加载时按此表补回缺省字段（jsonOptimizer.normalizeDefaultFields），保证 1:1 还原。
 *
 * 注意：
 * - left/top/width/height/text/src/path/x1.. 等"数据字段"不在此表，永不剔除；
 * - 自定义扩展键（id / extensionType / extension / gradientAngle / follow 等）不在表内，不会误删；
 * - 字段值不等于默认值时不会被剔除（如用户显式设置的 scaleX:0.5 / angle:45）。
 */
const COMMON = {
  originX: 'left',
  originY: 'top',
  fill: 'rgb(0,0,0)',
  stroke: null,
  strokeWidth: 1,
  strokeDashArray: null,
  strokeLineCap: 'butt',
  strokeDashOffset: 0,
  strokeLineJoin: 'miter',
  strokeUniform: false,
  strokeMiterLimit: 4,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  shadow: null,
  visible: true,
  backgroundColor: '',
  fillRule: 'nonzero',
  paintFirst: 'fill',
  globalCompositeOperation: 'source-over',
  skewX: 0,
  skewY: 0,
  // 编辑器扩展键（getExtensionKey）默认值：等于默认时剔除安全（fromObject 会补回）。
  // 注意：仅收录"对象上真实存在的 fabric 属性"（selectable/hasControls 默认 true）；
  // 未设置的扩展键（isVariableImage / roundValue 等默认 undefined）不会出现在序列化结果中，不入表。
  selectable: true,
  evented: true,
  hasControls: true,
};

const TEXT = {
  ...COMMON,
  fontFamily: 'Times New Roman',
  fontWeight: 'normal',
  fontSize: 40,
  underline: false,
  overline: false,
  linethrough: false,
  textAlign: 'left',
  fontStyle: 'normal',
  lineHeight: 1.16,
  textBackgroundColor: '',
  charSpacing: 0,
  styles: [],
  direction: 'ltr',
  path: null,
  pathStartOffset: 0,
  pathSide: 'left',
  pathAlign: 'baseline',
  editable: true,
};

export const OBJECT_DEFAULTS = {
  rect: { ...COMMON, rx: 0, ry: 0 },
  circle: COMMON,
  ellipse: { ...COMMON, rx: 0, ry: 0 },
  triangle: COMMON,
  polygon: COMMON,
  line: COMMON,
  arrow: COMMON,
  thinTailArrow: COMMON,
  path: COMMON,
  image: { ...COMMON, strokeWidth: 0, cropX: 0, cropY: 0, crossOrigin: null, filters: [] },
  group: { ...COMMON, strokeWidth: 0 },
  activeSelection: { ...COMMON, strokeWidth: 0 },
  text: { ...TEXT },
  'i-text': { ...TEXT },
  textbox: {
    ...TEXT,
    minWidth: 20,
    splitByGrapheme: false,
    clipEnabled: false,
    ellipsisEnabled: false,
    frameHeight: null,
    autoGrow: false,
    autoGrowMinHeight: null,
    autoGrowMaxHeight: null,
  },
};

export function getDefaultsForType(type) {
  return OBJECT_DEFAULTS[type] || COMMON;
}