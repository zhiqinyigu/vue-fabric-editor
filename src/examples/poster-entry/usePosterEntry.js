/*
 * 海报入口公共派生逻辑
 * - parsePosterJson：粘贴 JSON 校验/转换纯函数
 * - computeFit：海报原始尺寸 → 固定画框的 contain 缩放样式（布局层 + transform 缩放层）
 * - useStageWidth：舞台宽度测量（ResizeObserver，随条件渲染重挂载）
 * - usePosterEntry：值字符串 → 解析状态派生（parsed / hasValue / hasVariables）
 */
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from '@vue/composition-api';

/** 从画布 JSON 中找 workspace 节点 */
export function findWorkspace(json) {
  return json && json.objects ? json.objects.find((o) => o && o.id === 'workspace') : null;
}

/** 解析结果 → 状态派生（hasValue：有画布数据；hasVariables：含变量），卡片与舞台共用 */
export function getPosterStatus(parsed) {
  const hasValue = !!(parsed && Array.isArray(parsed.objects) && parsed.objects.length);
  const meta = parsed && parsed.variableMeta;
  const hasVariables = !!(meta && Array.isArray(meta.variables) && meta.variables.length);
  return { hasValue, hasVariables };
}

/**
 * contain 缩放计算：不放大，同时受画框宽高约束。
 * 返回 box（缩放后布局占位，用于撑起画框内的海报区域）与
 * inner（原始像素 + transform scale，避免 transform 不改变布局占位导致撑开容器）。
 */
export function computeFit(ws, boxW, boxH) {
  if (!ws || !ws.width || !ws.height || !boxW || !boxH) return null;
  const k = Math.min(boxW / ws.width, boxH / ws.height, 1);
  const w = Math.round(ws.width * k);
  return {
    box: { width: `${w}px`, height: `${Math.round(ws.height * k)}px` },
    inner: {
      width: `${ws.width}px`,
      height: `${ws.height}px`,
      transform: `scale(${w / ws.width})`,
    },
  };
}

/** 粘贴 JSON 校验/转换（纯函数，错误信息直接可展示） */
export function parsePosterJson(text, field, transform) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'JSON 格式不正确' };
  }
  if (!obj || !Array.isArray(obj.objects) || !obj.objects.length) {
    return { ok: false, error: '缺少 objects 画布数据' };
  }
  const ws = findWorkspace(obj);
  const expect = field && field.expectedSize;
  if (expect && ws && (ws.width !== expect.width || ws.height !== expect.height)) {
    return {
      ok: false,
      error: `尺寸不符（期望 ${expect.width}×${expect.height}，实际 ${ws.width}×${ws.height}）`,
    };
  }
  if (transform) {
    try {
      const out = transform(obj);
      obj = out === undefined ? obj : out;
    } catch (e) {
      return { ok: false, error: '数据转换失败：' + (e && e.message) };
    }
  }
  return { ok: true, json: obj };
}

/** 舞台宽度测量：条件渲染节点由调用方在值变化后调用 attach() 重挂载观察 */
export function useStageWidth() {
  const stage = ref(null);
  const stageWidth = ref(0);
  let ro = null;

  const measure = () => {
    const el = stage.value;
    if (!el) return;
    const cs = getComputedStyle(el);
    stageWidth.value = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  };
  const attach = () => {
    nextTick(() => {
      if (!ro) ro = new ResizeObserver(measure);
      ro.disconnect();
      if (stage.value) ro.observe(stage.value);
      measure();
    });
  };

  onMounted(attach);
  onBeforeUnmount(() => {
    if (ro) ro.disconnect();
    ro = null;
  });

  return { stage, stageWidth, attach };
}

/** 值字符串 → 解析状态派生（展示层共用：卡片 Tag / 舞台浮层显隐） */
export function usePosterEntry(props) {
  const parsed = computed(() => {
    if (!props.value) return null;
    try {
      const obj = JSON.parse(props.value);
      // 只接受对象/数组形态；标量（如纯数字 344365）是合法 JSON 但不是海报数据
      return obj && typeof obj === 'object' ? obj : null;
    } catch (e) {
      return null;
    }
  });
  const status = computed(() => getPosterStatus(parsed.value));
  return {
    parsed,
    hasValue: computed(() => status.value.hasValue),
    hasVariables: computed(() => status.value.hasVariables),
  };
}
