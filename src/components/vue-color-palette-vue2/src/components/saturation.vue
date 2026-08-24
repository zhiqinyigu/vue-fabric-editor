<template>
  <div
    ref="containerRef"
    data-color-palette="saturation"
    :style="{
      backgroundColor,
      cursor: isDragging ? 'grabbing' : 'grab',
    }"
    @click="onClick"
    @mousedown="onMouseDown"
    @touchstart="onTouchStart"
  >
    <div
      data-color-palette="saturation-thumb"
      role="slider"
      :style="{
        left: `${position.x}%`,
        top: `${position.y}%`,
        backgroundColor: thumbColor,
      }"
    />
  </div>
</template>

<script>
import { computed, ref } from '@vue/composition-api';
import { colord } from 'colord';
import { useEventListener } from '../composables';

export default {
  name: 'VcpSaturation',
  props: {
    color: {
      type: Object,
      required: true,
    },
  },
  setup(props, { emit }) {
    const colorModel = computed({
      get: () => props.color,
      set: (value) => emit('update:color', value),
    });

    const containerRef = ref(null);
    const isDragging = ref(false);
    // 拖拽期间的本地状态：h(色相) 在按下时定格，s/v(饱和度/明度) 实时取指针，
    // 避免经颜色模型往返转换丢失近黑色(低 v)时的饱和度/污染色相而导致的偏移与跳角
    const dragState = ref(null);
    // 最近一次指针产生的 s/v：低明度(近黑)时模型无法保留饱和度，用它兜底避免松手跳角
    const lastSV = ref(null);

    const backgroundColor = computed(() => {
      const hsv = colorModel.value.toHsv();
      return colord({ h: hsv.h, s: 100, v: 100, a: 1 }).toHslString();
    });

    const thumbColor = computed(() => colorModel.value.toRgbString());

    // 拖拽中直接用 dragState 渲染滑块位置，保证滑块始终精确跟随指针
    const position = computed(() => {
      const st = dragState.value;
      if (st) {
        return { x: st.s, y: 100 - st.v };
      }
      const hsv = colorModel.value.toHsv();
      // 低明度(近黑)时模型往返会丢失饱和度(s=0)，用最近一次指针值兜底，避免松手跳角
      if (lastSV.value && hsv.v <= 2) {
        return { x: lastSV.value.s, y: 100 - lastSV.value.v };
      }
      return {
        x: (hsv.s / 100) * 100,
        y: (1 - hsv.v / 100) * 100,
      };
    });

    function getPointer(event) {
      if (event instanceof MouseEvent) {
        return { x: event.clientX, y: event.clientY };
      }
      const touch = event.touches[0] || event.changedTouches[0];
      if (!touch) return null;
      return { x: touch.clientX, y: touch.clientY };
    }

    // 将指针坐标换算为 s(0-100) / v(0-100)
    function pointerToSV(event) {
      if (!containerRef.value) return null;
      const rect = containerRef.value.getBoundingClientRect();
      const pointer = getPointer(event);
      if (!pointer) return null;
      const x = Math.max(0, Math.min(1, (pointer.x - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (pointer.y - rect.top) / rect.height));
      const sv = { s: x * 100, v: (1 - y) * 100 };
      lastSV.value = sv;
      return sv;
    }

    // 写入模型：用 dragState 的 h/s/v + 当前 alpha 构造新颜色
    function commitColor(st) {
      const hsv = colorModel.value.toHsv();
      colorModel.value = colord({ h: st.h, s: st.s, v: st.v, a: hsv.a });
    }

    function startDrag(event) {
      const sv = pointerToSV(event);
      if (!sv) return;
      const hsv = colorModel.value.toHsv();
      dragState.value = { h: hsv.h, s: sv.s, v: sv.v };
      isDragging.value = true;
      commitColor(dragState.value);
      event.preventDefault();
    }

    function onClick(event) {
      const sv = pointerToSV(event);
      if (!sv) return;
      const hsv = colorModel.value.toHsv();
      commitColor({ h: hsv.h, s: sv.s, v: sv.v });
    }

    function onMouseDown(event) {
      startDrag(event);
    }

    function onTouchStart(event) {
      startDrag(event);
    }

    function onDragMove(event) {
      if (!isDragging.value || !dragState.value) return;
      const sv = pointerToSV(event);
      if (!sv) return;
      dragState.value.s = sv.s;
      dragState.value.v = sv.v;
      commitColor(dragState.value);
      if (event.cancelable) event.preventDefault();
    }

    function endDrag() {
      isDragging.value = false;
      dragState.value = null;
    }

    useEventListener(document, 'mousemove', (event) => onDragMove(event));
    useEventListener(document, 'mouseup', endDrag);
    useEventListener(document, 'touchmove', (event) => onDragMove(event), { passive: false });
    useEventListener(document, 'touchend', endDrag);

    return {
      containerRef,
      isDragging,
      backgroundColor,
      thumbColor,
      position,
      onClick,
      onMouseDown,
      onTouchStart,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='saturation'] {
  /* 用固定高度替代 aspect-ratio，既缩短面板，又保证拖拽期间几何稳定（避免测量震荡导致偏移/跳角） */
  width: 100%;
  height: 220px;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}
.color-palette [data-color-palette='saturation']::before {
  background: linear-gradient(90deg, #fff, transparent);
}
.color-palette [data-color-palette='saturation']::after {
  background: linear-gradient(0deg, #000, transparent);
}
.color-palette [data-color-palette='saturation']::before,
.color-palette [data-color-palette='saturation']::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.color-palette [data-color-palette='saturation'] [data-color-palette='saturation-thumb'] {
  z-index: 1;
  position: absolute;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
</style>
