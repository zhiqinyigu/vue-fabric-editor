/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-27 11:12:28
 * 变量图渲染期布局：把 enliven 后的变量图按"版位显示尺寸"拉伸铺满（与编辑器变量预览同语义）。
 *
 * 背景（为什么要存在，两个入口的尺寸语义差异）：
 * - 编辑器变量预览（VariablePlugin._reloadImageSrc）：setElement(真实图) 会把对象宽高重置为
 *   图片 natural 尺寸，再按版位显示尺寸（width×scaleX / height×scaleY）重算 scale → 拉伸铺满；
 * - 渲染器 enliven（fabric.Image.fromObject）：_setWidthHeight(options) 用 JSON 的
 *   width/height（保存时的版位源尺寸）覆盖 natural → 变成 crop 语义（drawImage 取真实图
 *   左上角 w×h 切片放大）→ 内容被裁剪。
 * 同一 isVariableImage 概念在两个入口渲染出不同尺寸，本函数在渲染期把差异拉平：
 * 宽高重置为 natural、scale = 版位显示尺寸 / natural、left/top 不动、强制 dirty 失效位图缓存。
 *
 * 幂等性：isVariableImage 也可能标记"纯在线图"（编辑器 AttributeOnlineImg 对远程 URL 同样置标），
 * 其 natural == 保存尺寸，重算 scale 为恒等变换，跳过不动；变量图换真实数据图后才会实际布局。
 */
/*
 * 变量图渲染期布局：把 enliven 后的变量图按"版位显示尺寸"拉伸铺满（与编辑器变量预览同语义）。
 *
 * 背景（为什么要存在，两个入口的尺寸语义差异）：
 * - 编辑器变量预览（VariablePlugin._reloadImageSrc）：setElement(真实图) 会把对象宽高重置为
 *   图片 natural 尺寸，再按版位显示尺寸（width×scaleX / height×scaleY）重算 scale → 拉伸铺满；
 * - 渲染器 enliven（fabric.Image.fromObject）：_setWidthHeight(options) 用 JSON 的
 *   width/height（保存时的版位源尺寸）覆盖 natural → 变成 crop 语义（drawImage 取真实图
 *   左上角 w×h 切片放大）→ 内容被裁剪。
 * 同一 isVariableImage 概念在两个入口渲染出不同尺寸，本函数在渲染期把差异拉平：
 * 宽高重置为 natural、scale = 版位显示尺寸 / natural、left/top 不动、强制 dirty 失效位图缓存。
 *
 * 幂等性：isVariableImage 也可能标记"纯在线图"（编辑器 AttributeOnlineImg 对远程 URL 同样置标），
 * 其 natural == 保存尺寸，重算 scale 为恒等变换，跳过不动；变量图换真实数据图后才会实际布局。
 *
 * clipPath（形状裁切）补偿（与编辑器 VariablePlugin._compensatePreviewClipPath 同语义）：
 * 类似椭圆/圆形裁切的变量图（如 legacy avatar 的满框圆）几何随对象变换走，独立轴拉伸
 * （nw≠nh 时双轴 scale 不同）会把圆拉成椭圆。按 prevScale/nextScale 反算 clip 的
 * scaleX/scaleY（k = 布局前/后对象 scale），保证"裁切形状屏幕大小 = 布局前编辑态"。
 */
const FIT_DELTA = 1; // natural 与保存尺寸差值超过该像素数才视为需要重排（浮点容差）

// 裁切形状需要补偿的类型：Circle/Ellipse（局部空间 origin center，与 editor 正确形态一致）
function isShapedClip(obj) {
  const clip = obj.clipPath;
  if (!clip) return null;
  return clip.type === 'ellipse' || clip.type === 'circle' ? clip : null;
}

/**
 * 遍历画布，把标准变量图拉伸铺满保存时的版位（FabricRenderer 在图片元素就绪后调用，
 * 结果由渲染流程既有的 requestRenderAll 统一上屏）。
 * @param {Object} canvas fabric canvas
 * @returns {Boolean} 是否有对象被布局
 */
export function layoutVariableImages(canvas) {
  if (!canvas || !canvas.getObjects) return false;
  let changed = false;
  canvas.getObjects().forEach((obj) => {
    if (!obj || obj.type !== 'image' || obj.isVariableImage !== true) return;
    const el = obj.getElement && obj.getElement();
    if (!el) return;
    const nw = el.naturalWidth || el.width || 0;
    const nh = el.naturalHeight || el.height || 0;
    // enliven 后 obj.width/height = JSON 保存的版位源尺寸，×scale = 版位显示尺寸
    const boxW = (obj.width || 0) * (obj.scaleX || 1);
    const boxH = (obj.height || 0) * (obj.scaleY || 1);
    if (!(nw > 0) || !(nh > 0) || !(boxW > 0) || !(boxH > 0)) return;
    if (Math.abs(nw - obj.width) <= FIT_DELTA && Math.abs(nh - obj.height) <= FIT_DELTA) return;
    const prevScaleX = obj.scaleX || 1;
    const prevScaleY = obj.scaleY || 1;
    obj.set({ width: nw, height: nh, scaleX: boxW / nw, scaleY: boxH / nh });
    // 裁切形状补偿（椭圆/圆）：k = 布局前/后对象 scale，clip 局部值反缩放后屏幕形状不变
    const clip = isShapedClip(obj);
    if (clip) {
      clip.scaleX = (clip.scaleX || 1) * (prevScaleX / (obj.scaleX || 1) || 1);
      clip.scaleY = (clip.scaleY || 1) * (prevScaleY / (obj.scaleY || 1) || 1);
      clip.setCoords && clip.setCoords();
      clip.dirty = true;
    }
    // 强制失效位图缓存：布局后显示尺寸与原版位相同，_updateCacheCanvas 按显示尺寸判断
    // 不会重建缓存，画布仍会画旧的裁剪切片（fabric set 为裸赋值不清缓存）
    obj.dirty = true;
    if (obj.canvas && obj.setCoords) obj.setCoords();
    changed = true;
  });
  return changed;
}
