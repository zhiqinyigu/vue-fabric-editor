/*
 * fabric.Image 渲染防御补丁
 *
 * 背景：fabric 的 fabric.Image.setElement 在图片带非空 filters 时会调用 applyFilters，
 * 而 applyFilters 以 _originalElement 的尺寸创建 canvas 作为新 _element。
 * 若此时元素为 0 尺寸（图片未完成加载 / 加载失败 / 本身是 0×0 的 SVG 等），
 * 会生成 0×0 的 canvas；随后 fabric.Image._renderFill 执行
 *   ctx.drawImage(elementToDraw, ...)
 * 浏览器对 0×0 canvas 参数抛 InvalidStateError，导致 loadFromJSON 的渲染回调整体中断、
 * 整张画布停留在空白（海报其余内容全部丢失）。预览态（FabricRenderer）因不挂载编辑插件、
 * 走不同的图片加载路径，往往不触发该路径，故编辑态更易中招。
 *
 * 修复：对 0 尺寸元素直接跳过绘制（不抛错），保证单个坏图不影响其余海报内容渲染；
 * 图片加载完成后（_element 具备真实尺寸）再正常绘制。幂等安装，编辑器与渲染器共用。
 */
import { fabric } from 'fabric';

let installed = false;

export function installImageRenderGuard() {
  if (installed) return;
  installed = true;

  const proto = fabric.Image.prototype;
  const originalRenderFill = proto._renderFill;
  // eslint-disable-next-line no-console
  console.log('[vfe] installImageRenderGuard 已安装（patch@20260911）');

  proto._renderFill = function (ctx) {
    const el = this._element;
    if (!el) return;
    const w = el.naturalWidth || el.width || 0;
    const h = el.naturalHeight || el.height || 0;
    if (w <= 0 || h <= 0) {
      // 0 尺寸元素：跳过绘制，避免 drawImage 对 0×0 canvas 抛 InvalidStateError
      // 导致整画布空白。无条件输出元素详情用于诊断定位坏图。
      // eslint-disable-next-line no-console
      console.warn(
        '[vfe] 跳过 0 尺寸图片绘制：',
        'tag=',
        el && el.tagName,
        'src=',
        this.src,
        'el.width=',
        el && el.width,
        'el.height=',
        el && el.height,
        'naturalWidth=',
        el && el.naturalWidth,
        'complete=',
        el && el.complete
      );
      return;
    }
    return originalRenderFill.call(this, ctx);
  };

  // clipPath 防御：fabric 5 的 StaticCanvas.renderCanvas 画布级裁剪路径
  //（canvas.clipPath）经 drawClipPathOnCanvas 直接
  // ctx.drawImage(clipPath._cacheCanvas, ...)，当缓存画布为 0×0（容器未就绪/
  // 尺寸异常时构建）会抛 InvalidStateError，中断整次 renderAll
  //（典型触发点：RulerPlugin.showGuideline 内同步 renderAll）。
  // 注意：该方法定义在 StaticCanvas.prototype（签名仅 ctx），不是 Object.prototype。
  const scProto = fabric.StaticCanvas.prototype;
  const originalDrawClipPath = scProto.drawClipPathOnCanvas;
  if (originalDrawClipPath) {
    scProto.drawClipPathOnCanvas = function (ctx) {
      const path = this.clipPath;
      const cache = path && path._cacheCanvas;
      if (cache && (!cache.width || !cache.height)) {
        // 标记脏：容器尺寸就绪后下一次渲染会按真实尺寸重建缓存，
        // 本守卫随后不再命中（避免 0×0 缓存与 warn 长期残留）
        path.dirty = true;
        // eslint-disable-next-line no-console
        console.warn('[vfe] 跳过 0 尺寸 clipPath 缓存绘制（已标记重建）：', path.type, path.id);
        return;
      }
      return originalDrawClipPath.call(this, ctx);
    };
  } else {
    // eslint-disable-next-line no-console
    console.warn('[vfe] 未找到 StaticCanvas.drawClipPathOnCanvas，clipPath 守卫未安装');
  }
}
