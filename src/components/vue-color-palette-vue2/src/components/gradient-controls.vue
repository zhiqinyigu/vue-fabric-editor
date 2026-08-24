<template>
  <div data-color-palette="gradient-controls">
    <div data-color-palette="gradient-input-controls">
      <div v-if="colorModeModel === 'linear-gradient'" data-color-palette="gradient-angle">
        <span>{{ t('gradient.angle') }}</span>
        <AngleHandle :value.sync="angleModel" />
      </div>

      <InputNumber
        v-if="colorModeModel === 'radial-gradient'"
        :value.sync="positionXModel"
        :label="t('gradient.position-x')"
        suffix="%"
      />
      <InputNumber
        v-if="colorModeModel === 'radial-gradient'"
        :value.sync="positionYModel"
        :label="t('gradient.position-y')"
        suffix="%"
      />

      <InputNumber :value.sync="percentage" :label="t('gradient.percentage')" suffix="%" />
    </div>

    <Button @click="handleDelete">
      <TrashIcon />
    </Button>
  </div>
</template>

<script>
import { computed } from '@vue/composition-api';
import { useI18n } from '../composables';
import { AngleHandle, Button, Icon, InputNumber } from './common';

export default {
  name: 'VcpGradientControls',
  components: { AngleHandle, Button, InputNumber, TrashIcon: Icon.Trash },
  props: {
    stopsMap: {
      type: [Map, Object],
      required: true,
    },
    colorMode: {
      type: String,
      required: true,
      default: 'monochrome',
    },
    angle: {
      type: Number,
      default: 90,
    },
    positionX: {
      type: Number,
      default: 0,
    },
    positionY: {
      type: Number,
      default: 50,
    },
    gradientConfig: {
      type: Object,
      required: true,
    },
    activeStopId: {
      type: Number,
      required: true,
    },
  },
  setup(props, { emit }) {
    const { t } = useI18n();

    const colorModeModel = computed({
      get: () => props.colorMode,
      set: (value) => emit('update:colorMode', value),
    });
    const angleModel = computed({
      get: () => props.angle,
      set: (value) => emit('update:angle', normalizeAngle(value)),
    });
    const positionXModel = computed({
      get: () => props.positionX,
      set: (value) => emit('update:positionX', value),
    });
    const positionYModel = computed({
      get: () => props.positionY,
      set: (value) => emit('update:positionY', value),
    });
    const gradientConfigModel = computed({
      get: () => props.gradientConfig,
      set: (value) => emit('update:gradientConfig', value),
    });
    const activeStopIdModel = computed({
      get: () => props.activeStopId,
      set: (value) => emit('update:activeStopId', value),
    });

    // 角度归一到 [0, 360]，兼容拖拽手柄可能产生的负数/越界值
    function normalizeAngle(value) {
      const n = Number(value);
      if (Number.isNaN(n) || !Number.isFinite(n)) return props.angle ?? 0;
      return Math.round(Math.min(360, Math.max(0, n)));
    }

    function getStopById(id) {
      return props.stopsMap.get(id);
    }

    const percentage = computed({
      get() {
        return getStopById(activeStopIdModel.value)?.percentage ?? 0;
      },
      set(value) {
        const config = gradientConfigModel.value;
        gradientConfigModel.value = {
          ...config,
          stops: config.stops.map((stop) =>
            stop.id === activeStopIdModel.value ? { ...stop, percentage: value } : stop
          ),
        };
      },
    });

    function handleDelete() {
      const config = gradientConfigModel.value;
      if (!config || config.stops.length <= 2) return;

      gradientConfigModel.value = {
        ...config,
        stops: config.stops.filter((stop) => stop.id !== activeStopIdModel.value),
      };
      activeStopIdModel.value = gradientConfigModel.value.stops[0].id;
    }

    return {
      t,
      colorModeModel,
      angleModel,
      positionXModel,
      positionYModel,
      gradientConfigModel,
      activeStopIdModel,
      percentage,
      handleDelete,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='gradient-controls'] {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--muted);
  border-radius: 4px;
  /* 改为 visible，避免裁剪角度手柄弹出的圆盘 */
  overflow: visible;
}

.color-palette [data-color-palette='gradient-input-controls'] {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding-inline: 16px;
}

.color-palette
  [data-color-palette='gradient-input-controls']
  [data-color-palette='gradient-angle'] {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
</style>
