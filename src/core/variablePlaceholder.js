/*
 * 变量占位共享工具（编辑器 VariablePlugin 与渲染器占位兜底共用，单一事实源）
 * - 占位底图：240x160 纯色底 #F1F3F5；边框与变量名由 VariableImageOverlay
 *   （src/core/objects/VariableImage.js）矢量叠加层实时绘制（反缩放补偿），
 *   占位底图本身不含文字，任意拉伸不变形
 */
import { extractVariablesFromString } from './variableEngine';

// 生成"动态变量占位图"底图：纯色底 dataURL
export function makeVariablePlaceholderDataUrl() {
  const width = 240;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F1F3F5';
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

// 从变量 URL 提取叠层显示的变量名（如 "user.id"），多个变量用 ", " 连接
export function extractVariableLabel(src, delimiter) {
  const vars = extractVariablesFromString(src, delimiter);
  return vars.join(', ') || 'variable';
}
