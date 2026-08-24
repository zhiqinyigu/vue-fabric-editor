import { computed, nextTick, ref, watch, onBeforeUnmount } from '@vue/composition-api';
import { isClient } from '../utils';
import { useEventListener } from './use-event-listener';

// 基于 position:fixed 的极简定位实现，替代 Vue3 版本中的 @floating-ui/dom
// 固定 bottom-end 对齐，带基本的 flip / shift / offset 逻辑
export function useFloating(options = {}) {
  const referenceEl = ref(null);
  const floatingEl = ref(null);

  let showTimer = null;
  let hideTimer = null;

  const open = ref(false);

  const x = ref(null);
  const y = ref(null);

  const GAP = 6;
  const PADDING = 5;

  // 面板是否切换为左右结构（saturation 在左）。由自动布局决定，并透出供宿主绑定到 ColorPicker
  const horizontal = ref(false);
  // 垂直布局（左右居中摆放）时实测到的面板高度，作为自动上下/左右切换的依据
  let verticalBoxH = null;

  function resolveEnableAutoLayout() {
    if (typeof options.enableAutoLayout === 'function') return options.enableAutoLayout();
    return options.enableAutoLayout !== false;
  }

  // 计算垂直布局在给定参考矩形下，上/下/左右居中各自能否容纳（返回三项布尔）
  function computeVerticalFit(refRect, h) {
    const vh = window.innerHeight;
    const fitsAbove = refRect.top - PADDING >= h + GAP;
    const fitsBelow = vh - refRect.bottom - PADDING >= h + GAP;
    // 左右摆放时面板垂直居中对齐触发器，需触发器中心上下各有 h/2 的空间
    const center = refRect.top + refRect.height / 2;
    const fitsSide = center >= PADDING + h / 2 && center + h / 2 <= vh - PADDING;
    return { fitsAbove, fitsBelow, fitsSide };
  }

  // 垂直布局尺寸在一点都放不下（上/下不行，左右居中也不足）时，切到左右结构以大幅降低面板高度
  function decideHorizontal() {
    if (!resolveEnableAutoLayout() || horizontal.value) return false;
    const ref = referenceEl.value;
    if (!ref || verticalBoxH == null || !isClient()) return false;
    const { fitsAbove, fitsBelow, fitsSide } = computeVerticalFit(
      ref.getBoundingClientRect(),
      verticalBoxH
    );
    if (!fitsAbove && !fitsBelow && !fitsSide) {
      horizontal.value = true;
      return true;
    }
    return false;
  }

  // 左右结构下，若当前空间已能容纳垂直布局（上/下/左右任一方向放得下），即恢复为上下结构
  function decideRevert() {
    if (!resolveEnableAutoLayout() || !horizontal.value) return false;
    const ref = referenceEl.value;
    if (!ref || verticalBoxH == null || !isClient()) return false;
    const { fitsAbove, fitsBelow, fitsSide } = computeVerticalFit(
      ref.getBoundingClientRect(),
      verticalBoxH
    );
    if (fitsAbove || fitsBelow || fitsSide) {
      horizontal.value = false;
      return true;
    }
    return false;
  }

  // 记录垂直布局（尚未切换）时实测到的面板高度，供上/下/左右切换判断
  function measureVertical() {
    if (horizontal.value) return;
    const float = floatingEl.value;
    if (!float) return;
    const rect = float.getBoundingClientRect();
    if (!rect.height) return;
    verticalBoxH = rect.height;
  }

  async function updatePosition() {
    const ref = referenceEl.value;
    const float = floatingEl.value;
    if (!ref || !float || !isClient()) return;

    // 左右结构：空间能容纳垂直布局则恢复上下；上下结构：四周都无法容纳则切到左右。
    // 布局切换后先等重排，再测量实际尺寸定位，避免用切换前的旧尺寸计算。
    const layoutChanged = horizontal.value ? decideRevert() : decideHorizontal();
    if (!horizontal.value) measureVertical();
    if (layoutChanged) await nextTick();

    const refRect = ref.getBoundingClientRect();
    const floatRect = float.getBoundingClientRect();
    const w = floatRect.width;
    const h = floatRect.height;

    const { side, align } = parsePlacement(resolvePlacement());
    const enableFallback = resolveEnableFallback();

    let result;
    if (side === 'top' || side === 'bottom') {
      // 主方向为上下
      result = placeVertical(side, align, refRect, w, h);
      if (!result && enableFallback) {
        // 上下均无法容纳时，回退到左右方向展示
        result = placeHorizontalFallback(refRect, w, h);
      }
      if (!result) {
        // 未启用回退且上下都放不下：按主方向摆放，交由 clamp 收缩进视口
        result = {
          x: align === 'start' ? refRect.left : refRect.right - w,
          y: side === 'top' ? refRect.top - h - GAP : refRect.bottom + GAP,
        };
      }
    } else {
      // 主方向为左右
      result = placeHorizontal(side, refRect, w, h);
    }

    x.value = clampX(result.x, w);
    y.value = clampY(result.y, h);
  }

  // 解析 placement 字符串 => { side: top|bottom|left|right, align: start|end }
  function parsePlacement(str = 'bottom-end') {
    const [side, align] = str.split('-');
    return { side: side || 'bottom', align: align || 'end' };
  }

  function resolvePlacement() {
    if (typeof options.placement === 'function') return options.placement();
    return options.placement || 'bottom-end';
  }

  function resolveEnableFallback() {
    if (typeof options.enableFallback === 'function') return options.enableFallback();
    return options.enableFallback !== false;
  }

  function clampX(left, w) {
    return Math.max(PADDING, Math.min(left, window.innerWidth - w - PADDING));
  }

  function clampY(top, h) {
    return Math.max(PADDING, Math.min(top, window.innerHeight - h - PADDING));
  }

  // 垂直主方向：优先主侧，主侧不足翻到对侧；两侧都不足返回 null（触发左右回退）
  function placeVertical(side, align, refRect, w, h) {
    const spaceAbove = refRect.top - PADDING;
    const spaceBelow = window.innerHeight - refRect.bottom - PADDING;
    const fitsPrimary = side === 'top' ? spaceAbove >= h + GAP : spaceBelow >= h + GAP;
    const fitsOpposite = side === 'top' ? spaceBelow >= h + GAP : spaceAbove >= h + GAP;
    const x = align === 'start' ? refRect.left : refRect.right - w;
    if (fitsPrimary) {
      return { x, y: side === 'top' ? refRect.top - h - GAP : refRect.bottom + GAP };
    }
    if (fitsOpposite) {
      return { x, y: side === 'top' ? refRect.bottom + GAP : refRect.top - h - GAP };
    }
    return null;
  }

  // 左右回退：选择能容纳的一侧，垂直方向居中对齐触发器
  function placeHorizontalFallback(refRect, w, h) {
    const spaceLeft = refRect.left - PADDING;
    const spaceRight = window.innerWidth - refRect.right - PADDING;
    const fitsRight = spaceRight >= w + GAP;
    const fitsLeft = spaceLeft >= w + GAP;
    let x;
    if (fitsRight) {
      x = refRect.right + GAP;
    } else if (fitsLeft) {
      x = refRect.left - GAP - w;
    } else {
      x = spaceRight >= spaceLeft ? refRect.right + GAP : refRect.left - GAP - w;
    }
    const y = refRect.top + refRect.height / 2 - h / 2;
    return { x, y };
  }

  // 左右主方向：优先主侧，主侧不足翻到对侧，垂直居中
  function placeHorizontal(side, refRect, w, h) {
    const spaceLeft = refRect.left - PADDING;
    const spaceRight = window.innerWidth - refRect.right - PADDING;
    const fitsSide = side === 'right' ? spaceRight >= w + GAP : spaceLeft >= w + GAP;
    const fitsOpposite = side === 'right' ? spaceLeft >= w + GAP : spaceRight >= w + GAP;
    let x;
    if (fitsSide) {
      x = side === 'right' ? refRect.right + GAP : refRect.left - GAP - w;
    } else if (fitsOpposite) {
      x = side === 'right' ? refRect.left - GAP - w : refRect.right + GAP;
    } else {
      // 两侧都放不下：保持主侧，交由 clamp 收缩进视口
      x = side === 'right' ? refRect.right + GAP : refRect.left - GAP - w;
    }
    const y = refRect.top + refRect.height / 2 - h / 2;
    return { x, y };
  }

  const floatingStyle = computed(() => ({
    position: 'fixed',
    top: `${y.value ?? 0}px`,
    left: `${x.value ?? 0}px`,
    zIndex: 1000,
  }));

  const appendTo = computed(() => {
    if (!isClient()) return 'body';
    const target = typeof options.getContainer === 'function' ? options.getContainer() : null;
    return target || 'body';
  });

  function clearTimers() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function show() {
    clearTimers();
    const delay = resolveDelay();
    showTimer = window.setTimeout(() => {
      open.value = true;
      updatePosition();
    }, delay);
  }

  function hide() {
    clearTimers();
    const delay = resolveDelay();
    hideTimer = window.setTimeout(() => {
      open.value = false;
    }, delay);
  }

  function resolveDelay() {
    let d = options.delay;
    if (Array.isArray(d)) return d[1] ?? d[0] ?? 0;
    return typeof d === 'number' ? d : 0;
  }

  function toggle() {
    open.value = !open.value;
    if (open.value) updatePosition();
  }

  function onClick() {
    toggle();
  }

  let repositioning = false;
  let resizeObserver = null;

  // 统一入口，防重入：updatePosition 内部可能 await nextTick（布局切换），
  // ResizeObserver / scroll / resize 都可能再次触发，避免并发一起算。
  const reposition = async () => {
    if (repositioning) return;
    repositioning = true;
    try {
      await updatePosition();
    } finally {
      repositioning = false;
    }
  };

  // 监听浮层内容尺寸变化（如切换颜色模式导致面板高度变化），高度变了就重新定位/判定布局
  function observeFloatingSize() {
    if (typeof ResizeObserver === 'undefined' || resizeObserver) return;
    const el = floatingEl.value;
    if (!el) return;
    resizeObserver = new ResizeObserver(() => {
      reposition();
    });
    resizeObserver.observe(el);
  }

  function disconnectFloating() {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  }

  function startAutoUpdate() {
    if (!isClient()) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    observeFloatingSize();
  }

  function stopAutoUpdate() {
    if (!isClient()) return;
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    disconnectFloating();
  }

  let pointerDownInside = false;

  // 记录最近一次 mousedown 是否发生在浮层/触发器内部。
  // 任意 click 前必先有 mousedown，因此这里总能反映「本次点击释放的起始位置」。
  function handlePointerDown(event) {
    const target = event.target;
    pointerDownInside = !!(
      (referenceEl.value && referenceEl.value.contains(target)) ||
      (floatingEl.value && floatingEl.value.contains(target))
    );
  }

  function handleClickOutside(event) {
    if (!open.value) return;
    const target = event.target;
    // 内层浮层（如 format-picker-dropdown）可能渲染到 body，不在本浮层 DOM 内；
    // 点击它们应视为「面板内部」而不关闭面板，避免响应式重渲染替换节点导致误判
    const isClickInside =
      (referenceEl.value && referenceEl.value.contains(target)) ||
      (floatingEl.value && floatingEl.value.contains(target)) ||
      (target &&
        typeof target.closest === 'function' &&
        target.closest('[data-color-palette="format-picker-dropdown"]'));
    // 从面板内部按下（拖拽饱和度等）后在面板外释放，点击虽然落在外侧也不关闭
    if (isClickInside || pointerDownInside) return;
    open.value = false;
  }

  watch(open, (value) => {
    if (value) {
      // 弹层渲染完成后再测量定位，并挂上 ResizeObserver 以响应内容高度变化
      nextTick(() => {
        observeFloatingSize();
        updatePosition();
      });
      startAutoUpdate();
    } else {
      stopAutoUpdate();
    }
  });

  onBeforeUnmount(() => {
    clearTimers();
    stopAutoUpdate();
  });

  useEventListener(document, 'mousedown', handlePointerDown);
  useEventListener(document, 'click', handleClickOutside);

  return {
    referenceEl,
    floatingEl,
    open,
    appendTo,
    floatingStyle,
    show,
    hide,
    onClick,
    // 自动布局：左右结构开关，宿主将其绑定到 ColorPicker 的 horizontal
    horizontal,
    // 兼容 Vue3 原接口的额外字段
    updatePosition,
    toggle,
  };
}
