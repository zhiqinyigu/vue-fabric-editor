<template>
  <div data-color-palette="angle-handle">
    <section data-color-palette="angle-handle-field">
      <input
        ref="numInput"
        v-model="num"
        data-color-palette="input-number"
        @focus="visible = true"
        @blur="visible = false"
      />
      <span data-color-palette="input-number-suffix">°</span>
    </section>

    <div
      v-show="visible"
      data-color-palette="angle-handle-disc"
      @mousedown="dragStart"
      @mouseup="dragEnd"
    >
      <div data-color-palette="angle-handle-circle" @mousemove="dragMove" @mouseup="dragEnd">
        <div data-color-palette="angle-handle-line" :style="lineStyle"></div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, ref, watch } from '@vue/composition-api';

export default {
  name: 'VcpAngleHandle',
  props: {
    value: {
      type: Number,
      default: 90,
    },
  },
  setup(props, { emit }) {
    const num = ref(props.value);
    const visible = ref(false);
    const inProcess = ref(false);
    const numInput = ref(null);

    const angleInDegrees = computed(() => num.value - 90);

    const lineStyle = computed(() => ({
      transform: `rotate(${angleInDegrees.value}deg)`,
    }));

    // 归一到 [0, 360)，兼容 atan2 产生的负数与越界
    function normalizeAngle(value) {
      const n = Number(value);
      if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
      return ((n % 360) + 360) % 360;
    }

    watch(num, (value) => {
      if (props.value !== num.value) emit('update:value', value);
    });
    watch(
      () => props.value,
      (value) => {
        num.value = value;
      }
    );

    function updateFromPointer(event) {
      if (!inProcess.value) return;
      // 圆形画布 54px，圆心在 (27, 27)
      const origin = { x: 27, y: 27 };
      const deltaX = event.offsetX - origin.x;
      const deltaY = event.offsetY - origin.y;
      const angleInRadians = Math.atan2(deltaY, deltaX);
      const angleInDegreesValue = (angleInRadians * 180) / Math.PI;
      num.value = normalizeAngle(angleInDegreesValue + 90);
    }

    function dragStart(event) {
      event.preventDefault();
      inProcess.value = true;
      updateFromPointer(event);
    }
    function dragMove(event) {
      updateFromPointer(event);
    }
    function dragEnd() {
      inProcess.value = false;
    }

    return {
      num,
      visible,
      lineStyle,
      numInput,
      dragStart,
      dragMove,
      dragEnd,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='angle-handle'] {
  position: relative;
}

.color-palette [data-color-palette='angle-handle-field'] {
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: var(--muted);
  border-radius: 4px;
  height: 24px;
  padding: 0 6px;
  min-width: 52px;
}

.color-palette [data-color-palette='angle-handle'] input[data-color-palette='input-number'] {
  width: 28px;
}

.color-palette [data-color-palette='angle-handle-disc'] {
  position: absolute;
  z-index: 2;
  right: 2px;
  top: calc(100% + 4px);
  width: 60px;
  height: 60px;
  border-radius: 7px;
  background: #fff;
  box-shadow: 0 4px 12px rgb(0 0 0 / 30%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-palette [data-color-palette='angle-handle-circle'] {
  width: 54px;
  height: 54px;
  position: relative;
  overflow: hidden;
  background: #f1f2f4;
  border-radius: 50%;
  user-select: none;
  cursor: pointer;
}

.color-palette [data-color-palette='angle-handle-line'] {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 1px;
  background: #999;
  pointer-events: none;
  transform-origin: left top;
}

.color-palette [data-color-palette='angle-handle-line']::before {
  position: absolute;
  content: '';
  left: -1px;
  top: -1px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #999;
}

.color-palette [data-color-palette='angle-handle-line']::after {
  position: absolute;
  content: '';
  right: 0;
  top: -2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #999;
}
</style>
