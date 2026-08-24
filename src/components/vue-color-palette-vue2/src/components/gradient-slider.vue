<template>
  <div
    ref="containerRef"
    class="slider"
    data-color-palette="gradient-slider"
    :style="{
      background: gradientColor || 'var(--primary)',
    }"
    @click="handleCreateStop"
  >
    <div
      v-for="item in value.stops"
      :key="item.id"
      class="slider-thumb"
      :class="{ 'is-selected': activeStopId === item.id }"
      data-color-palette="gradient-slider-thumb"
      :style="{
        position: 'absolute',
        left: getThumbPosition(item.percentage),
        backgroundColor: item.color.toRgbString(),
      }"
      @mousedown.stop="onThumbMouseDown($event, item.id)"
      @touchstart.stop="onThumbTouchStart($event, item.id)"
      @click.stop
    />
  </div>
</template>

<script>
import { computed, ref, watch } from '@vue/composition-api';
import { colord } from 'colord';
import { useEventListener } from '../composables';

export default {
  name: 'VcpGradientSlider',
  props: {
    gradientColor: {
      type: String,
      default: undefined,
    },
    stopsMap: {
      type: [Map, Object],
      required: true,
    },
    color: {
      type: Object,
      required: true,
    },
    value: {
      type: Object,
      required: true,
    },
    activeStopId: {
      type: Number,
      required: true,
    },
  },
  setup(props, { emit }) {
    const colorModel = computed({
      get: () => props.color,
      set: (value) => emit('update:color', value),
    });
    const activeStopIdModel = computed({
      get: () => props.activeStopId,
      set: (value) => emit('update:activeStopId', value),
    });
    const valueModel = computed({
      get: () => props.value,
      set: (value) => emit('update:value', value),
    });

    const containerRef = ref(null);
    const draggingStopId = ref(null);
    const hasMoved = ref(false);
    const isDragging = computed(() => draggingStopId.value !== null);

    const maxId = computed(() => {
      return Math.max(...props.value.stops.map((stop) => stop.id));
    });

    function getStopById(id) {
      return props.stopsMap.get(id);
    }

    function getThumbPosition(percentage) {
      return `max(8px, min(calc(100% - 8px), ${percentage}%))`;
    }

    function getColorAtPosition(percentage) {
      const stops = [...props.value.stops].sort((a, b) => a.percentage - b.percentage);

      if (percentage <= stops[0].percentage) return stops[0].color;

      if (percentage >= stops[stops.length - 1].percentage) return stops[stops.length - 1].color;

      for (let i = 0; i < stops.length - 1; i++) {
        const stop1 = stops[i];
        const stop2 = stops[i + 1];

        if (percentage >= stop1.percentage && percentage <= stop2.percentage) {
          const ratio = (percentage - stop1.percentage) / (stop2.percentage - stop1.percentage);

          const rgb1 = stop1.color.toRgb();
          const rgb2 = stop2.color.toRgb();

          const interpolatedRgb = {
            r: Math.round(rgb1.r + (rgb2.r - rgb1.r) * ratio),
            g: Math.round(rgb1.g + (rgb2.g - rgb1.g) * ratio),
            b: Math.round(rgb1.b + (rgb2.b - rgb1.b) * ratio),
            a: rgb1.a + (rgb2.a - rgb1.a) * ratio,
          };

          return colord(interpolatedRgb);
        }
      }

      return stops[0].color;
    }

    function getPointerX(event) {
      let clientX;
      if (event instanceof MouseEvent) {
        clientX = event.clientX;
      } else {
        const touch = event.touches[0] || event.changedTouches[0];
        if (!touch) return null;
        clientX = touch.clientX;
      }
      return clientX;
    }

    function updatePositionFromEvent(event, stopId) {
      if (!containerRef.value) return;

      const rect = containerRef.value.getBoundingClientRect();
      const clientX = getPointerX(event);
      if (clientX == null) return;

      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const percentage = Math.round(x * 100);

      valueModel.value = {
        ...props.value,
        stops: props.value.stops.map((stop) =>
          stop.id === stopId ? { ...stop, percentage } : stop
        ),
      };
    }

    function handleCreateStop(event) {
      if (isDragging.value || hasMoved.value || !(event.currentTarget instanceof HTMLElement))
        return;

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const percentage = Math.round((x / rect.width) * 100);

      const id = maxId.value + 1;
      const colorAtPosition = getColorAtPosition(percentage);
      valueModel.value = {
        ...props.value,
        stops: [
          ...props.value.stops,
          {
            id,
            percentage,
            color: colorAtPosition,
          },
        ],
      };
      activeStopIdModel.value = id;
    }

    function onThumbMouseDown(event, stopId) {
      activeStopIdModel.value = stopId;
      draggingStopId.value = stopId;
      hasMoved.value = false;
      updatePositionFromEvent(event, stopId);
      event.preventDefault();
      event.stopPropagation();
    }

    function onThumbTouchStart(event, stopId) {
      activeStopIdModel.value = stopId;
      draggingStopId.value = stopId;
      hasMoved.value = false;
      updatePositionFromEvent(event, stopId);
      event.preventDefault();
      event.stopPropagation();
    }

    function onMouseMove(event) {
      if (draggingStopId.value !== null) {
        hasMoved.value = true;
        updatePositionFromEvent(event, draggingStopId.value);
      }
    }

    function onMouseUp() {
      if (draggingStopId.value !== null) {
        draggingStopId.value = null;
        setTimeout(() => {
          hasMoved.value = false;
        }, 0);
      }
    }

    function onTouchMove(event) {
      if (draggingStopId.value !== null) {
        hasMoved.value = true;
        updatePositionFromEvent(event, draggingStopId.value);
        event.preventDefault();
      }
    }

    function onTouchEnd() {
      if (draggingStopId.value !== null) {
        draggingStopId.value = null;
        setTimeout(() => {
          hasMoved.value = false;
        }, 0);
      }
    }

    watch(
      activeStopIdModel,
      (stopId) => {
        const stop = getStopById(stopId);
        if (stop) colorModel.value = stop.color;
      },
      { immediate: true }
    );

    watch(colorModel, (data) => {
      const stop = getStopById(activeStopIdModel.value);
      if (stop) stop.color = data;
    });

    useEventListener(document, 'mousemove', onMouseMove);
    useEventListener(document, 'mouseup', onMouseUp);
    useEventListener(document, 'touchmove', onTouchMove, { passive: false });
    useEventListener(document, 'touchend', onTouchEnd);

    return {
      containerRef,
      getThumbPosition,
      handleCreateStop,
      onThumbMouseDown,
      onThumbTouchStart,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='gradient-slider'] {
  position: relative;
}

.color-palette [data-color-palette='gradient-slider-thumb'] {
  pointer-events: auto;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 50%;
  transform: translate(-50%, -50%);
}

.color-palette [data-color-palette='gradient-slider-thumb'].is-selected::after {
  content: '';
  width: 4px;
  height: 4px;
  background-color: #fff;
  border-radius: 50%;
}
</style>
