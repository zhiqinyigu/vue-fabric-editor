/*
 * @Author: cyc
 * @Date: 2026-09-07 14:31:56
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-07 14:31:56
 * 文本 styles 缺失兜底补丁（编辑器与渲染器共用）
 *
 * 背景：
 * 编辑器保存 JSON 时会按 objectDefaults 表剔除等于默认值的字段，其中文本对象默认
 * styles: [] 会被剔除；而 fabric.Text.fromObject / IText.fromObject 对 styles 的处理是
 * stylesFromArray(object.styles, ...) —— 非数组时原样返回，导致缺失 styles 字段的对象
 * 导入后实例 styles 为 undefined。此后任意序列化（ctrl+v 克隆、保存、导出）走
 * Text.toObject -> stylesToArray(undefined, text)，在 styles[i] 处抛
 * "Cannot read properties of undefined (reading '0')"，并因克隆中途异常破坏画布选中状态。
 *
 * 这里在 fabric.util 层兜底：
 * - stylesFromArray(null/undefined) -> {}（导入链路，恢复为空样式对象）
 * - stylesToArray(null/undefined)   -> []（序列化链路，克隆/保存/导出不再崩溃）
 */
import { fabric } from 'fabric';

// 诊断探针：运行时可查补丁是否在位（如被 bundle 摇树后该标记不存在）
const INSTALLED_FLAG = Symbol.for('vfe.stylesCompatInstalled');

// 幂等：编辑器与渲染器入口均会 import，重复执行不重复覆盖日志
if (!fabric.util[INSTALLED_FLAG]) {
  fabric.util[INSTALLED_FLAG] = true;
  // eslint-disable-next-line no-console
  console.debug('[vfe/stylesCompat] fabric styles 兜底补丁已安装');
}

const origStylesFromArray = fabric.util.stylesFromArray;
fabric.util.stylesFromArray = function (styles, text) {
  if (styles == null) return {};
  return origStylesFromArray.call(fabric.util, styles, text);
};

const origStylesToArray = fabric.util.stylesToArray;
fabric.util.stylesToArray = function (styles, text) {
  if (styles == null) return [];
  return origStylesToArray.call(fabric.util, styles, text);
};
