/*
 * img→canvas 导出失败回退的最小语义内核（LegacyFabricRenderer 消费）
 *
 * 背景：legacy 组件 img 模式靠 servers.preview 导出 dataURL 展示。画布含"跨域回退加载"
 * 的图片时被污染（tainted），toDataURL 恒抛 SecurityError，preview 兜底 resolve(null)
 * ——此时 img 展示拿不到图会永转 spinner。本内核把"自动回退 canvas 直显（保显示、
 * 舍导出）"的状态迁移与事件序列收敛为纯函数，便于 jest 直接回归。
 */

// preview export 失败进入 canvas 直显：返回需合并的组件状态与待 emit 事件序列
// prev: { exportFailed, canvasRatio, canvasReady }；opts: { w, h, core, reason }
// 首次失败：置 exportFailed、（有尺寸时）记录 aspectRatio 并隐藏 spinner，
// 依次 emit 'preview-fail'（宿主提示）与 'render'（null src + 画布尺寸 meta）
// 时序说明：renderer-error（TAINTED，无尺寸）常先于 preview resolve 到达；已回退但
// 本来就携带真实尺寸（preview_null 路径）时须**补齐** fit 态——否则 spinner 依赖的
// canvasReady 永远不被置位
export function enterPreviewFallback(prev, { w = 0, h = 0, core = null, reason = '' } = {}) {
  const meta = { width: w, height: h };
  const renders = [{ name: 'render', args: [null, meta] }];
  const fit = w > 0 && h > 0 ? { canvasRatio: `${w} / ${h}`, canvasReady: true } : {};
  if (prev.exportFailed) {
    return { state: fit, emits: renders };
  }
  const state = { exportFailed: true, ...fit };
  return {
    state,
    emits: [{ name: 'preview-fail', args: [{ core, code: 'CANVAS_TAINTED', reason }] }, ...renders],
  };
}

// 内层 FabricRenderer 转发的 renderer-error 是否为画布污染（保留 code 判定语义的唯一出处）
export function isTaintedError(code) {
  return code === 'CANVAS_TAINTED';
}
