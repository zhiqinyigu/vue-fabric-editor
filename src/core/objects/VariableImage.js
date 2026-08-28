/*
 * @Author: cyc
 * @Date: 2026-08-18 15:45:52
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-28 10:25:25
 * 变量图片占位元素：继承 fabric.Image，type 保持 'image'，与现有所有 image 逻辑完全兼容。
 * 占位图本身仅为纯色底（240x160），边框与变量名由矢量叠加层实时绘制，
 * 绘制时做反缩放补偿：
 *   - 字号按"一行文字占占位符 85% 宽度"动态计算，非等比缩放字形不被拉伸
 *   - 等比缩放：文字随对象等比例放大，矢量重绘始终清晰
 * 预览加载真实图时关闭叠加层（showPlaceholderText=false），仅显示真实图片。
 */
import { fabric } from 'fabric';

// 计算"一行文字占 maxWidth 的 85%"所需字号（px）。
// measureText 与当前 transform 无关，返回排版宽度；无 measureText 时按字符宽度估算
// （全角 ≈ 1 倍字号，ASCII ≈ 0.55 倍），保证测试/降级环境行为一致。
function calcFontSize(ctx, label, maxWidth, maxHeight, k) {
  const kk = k || 1;
  const baseFontSize = 16;
  ctx.font = baseFontSize + 'px sans-serif';
  let baseWidth = 0;
  try {
    baseWidth = ctx.measureText ? ctx.measureText(label).width : 0;
  } catch (e) {
    baseWidth = 0;
  }
  if (!baseWidth || baseWidth <= 0) {
    let units = 0;
    for (let i = 0; i < label.length; i++) {
      units += label.charCodeAt(i) > 255 ? 1 : 0.55;
    }
    baseWidth = baseFontSize * units;
  }
  let fontSize = (baseFontSize * maxWidth * 0.85) / baseWidth;
  // 高度上限：文字不超显示高度的 60%；下限：保证极小占位符仍可读
  fontSize = Math.min(fontSize, maxHeight * 0.6);
  fontSize = Math.max(fontSize, 8 * kk);
  return fontSize;
}

// 叠加层绘制逻辑（可被普通 fabric.Image 实例复用：见 VariablePlugin._attachVariableOverlay，
// 也可被图层列表缩略图复用：见 layer.vue renderVariableThumb）
fabric.VariableImageOverlay = {
  calcFontSize,
  // 绘制占位图视觉（边框 + 变量名）。
  // 坐标系约定：原点 = 占位图矩形中心，矩形显示尺寸为 dw x dh（屏幕像素），
  // 与 fabric 对象 _render 的坐标系一致（位图/角拖框都以中心为基准）。
  paint(ctx, dw, dh, label, k) {
    const kk = k || 1;
    // 边框（贴显示边缘）
    ctx.strokeStyle = '#D5DBE0';
    ctx.lineWidth = 2 * kk;
    ctx.strokeRect(-dw / 2 + 2 * kk, -dh / 2 + 2 * kk, dw - 4 * kk, dh - 4 * kk);
    // 变量名：字号 = 一行占 dw 的 85%，水平垂直居中
    const fontSize = calcFontSize(ctx, label, dw, dh, kk);
    ctx.fillStyle = '#9099A3';
    ctx.font = fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
  },
  draw(ctx, self) {
    if (self.showPlaceholderText === false) return;
    const sx = self.scaleX || 1;
    const sy = self.scaleY || 1;
    // 取较小缩放比例：等比时随对象放大，非等比时字形不被拉伸
    const k = Math.min(sx, sy) || 1;
    const w = self.width || 0;
    const h = self.height || 0;
    if (w <= 0 || h <= 0) return;
    // 对象显示尺寸（屏幕坐标系）
    const dw = w * sx;
    const dh = h * sy;
    const label = self.get('variableLabel') || 'variable';
    ctx.save();
    // 抵消对象缩放：叠加层在"未缩放坐标系"中绘制（1 单位 = 1 屏幕像素）。
    // 注意：fabric 的 _render 坐标系原点 = 对象中心，所以叠加层围绕中心定位。
    ctx.scale(1 / sx, 1 / sy);
    fabric.VariableImageOverlay.paint(ctx, dw, dh, label, k);
    ctx.restore();
  },
};

fabric.VariableImage = fabric.util.createClass(fabric.Image, {
  type: 'image',
  // 是否显示占位叠加层（边框 + 变量名）；预览真实图时为 false
  showPlaceholderText: true,
  // 叠加层显示的变量名文本（如 "user.id"）
  variableLabel: 'variable',

  initialize: function (element, options) {
    options || (options = {});
    this.callSuper('initialize', element, options);
    if (typeof options.variableLabel === 'string') {
      this.variableLabel = options.variableLabel;
    }
    if (typeof options.showPlaceholderText === 'boolean') {
      this.showPlaceholderText = options.showPlaceholderText;
    }
  },

  // 先渲染底图（纯色），再矢量叠加边框 + 变量名
  _render: function (ctx) {
    this.callSuper('_render', ctx);
    fabric.VariableImageOverlay.draw(ctx, this);
  },
});
// 变量图片的加载/还原统一由 VariablePlugin._patchImageFromObject 处理（需要占位图逻辑），
// 这里转发到 fabric.Image.fromObject（其已被插件补丁包装）。
fabric.VariableImage.fromObject = function (object, callback) {
  return fabric.Image.fromObject(object, callback);
};

// 挂载"占位叠加层"（边框 + 变量名实时矢量绘制，type 保持原样）。
// image 形态以 fabric.Image 渲染为底；rect（tile 背景）以 Rect 渲染为底（含 Pattern 填充）。
// 供 VariablePlugin 与 WorkspacePlugin（变量背景）共用。
export function attachVariableOverlay(obj) {
  if (!obj || obj._variableOverlayAttached) return obj;
  obj._variableOverlayAttached = true;
  obj.set('showPlaceholderText', true);
  const baseRender =
    obj.type === 'rect' ? fabric.Rect.prototype._render : fabric.Image.prototype._render;
  obj._render = function (ctx) {
    baseRender.call(this, ctx);
    fabric.VariableImageOverlay.draw(ctx, this);
  };
  return obj;
}

export default fabric.VariableImage;
