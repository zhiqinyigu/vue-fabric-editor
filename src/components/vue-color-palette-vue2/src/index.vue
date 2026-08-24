<template>
  <div
    v-if="localeLoaded"
    :data-disabled="disabled"
    class="color-palette"
    :class="[isDark ? 'dark' : 'light', horizontal ? 'is-horizontal' : '']"
    data-color-palette="color-palette"
    :style="cssVariables"
  >
    <Saturation :color.sync="currentColor" />

    <div data-color-palette="panel-body">
      <div v-if="hasControls" data-color-palette="controls-container">
        <div>
          <ModePicker
            v-if="enableModePicker"
            :color-mode.sync="currentColorMode"
            :color-modes="colorModes"
          />
        </div>

        <ColorToolbar
          :color.sync="currentColor"
          :format.sync="formatModel"
          :enable-eye-drop="eyeDropEnabled"
          :enable-format-picker="enableFormatPicker"
        />
      </div>

      <GradientControls
        v-if="currentColorMode !== 'monochrome'"
        :color-mode.sync="currentColorMode"
        :angle.sync="gradientConfig.angle"
        :position-x.sync="gradientConfig.positionX"
        :position-y.sync="gradientConfig.positionY"
        :gradient-config.sync="gradientConfig"
        :active-stop-id.sync="selectedStopId"
        :stops-map="stopsMap"
      />

      <GradientSlider
        v-if="currentColorMode !== 'monochrome'"
        :color.sync="currentColor"
        :value.sync="gradientConfig"
        :active-stop-id.sync="selectedStopId"
        :gradient-color="gradientColor"
        :stops-map="stopsMap"
      />

      <HueAlphaSliders
        :color.sync="currentColor"
        :preview-color="color"
        :enable-alpha="enableAlpha"
      />

      <ColorInputs
        v-if="enableInput"
        :color.sync="currentColor"
        :format="formatModel"
        :enable-alpha="enableAlpha"
        :original-color="originalColorValue"
        @restore="restoreOriginalColor"
      />

      <ColorList
        v-if="enableRecentColors"
        :value.sync="valueModel"
        :colors.sync="_recentColors"
        :color-mode.sync="currentColorMode"
        :label="t('text.recent-colors')"
        :enable-add-color="true"
        :enable-remove-color="true"
        @change="handleRecentColorsChange"
      />

      <ColorList
        v-if="swatchColorList.length > 0"
        :value.sync="valueModel"
        :color-mode.sync="currentColorMode"
        :colors="swatchColorList"
        :label="t('text.swatch-colors')"
      />
    </div>
  </div>
</template>

<script>
import { colord, extend } from 'colord';
import cmykPlugin from 'colord/plugins/cmyk';
import { computed, onMounted, ref, toRefs, watch } from '@vue/composition-api';
import ColorInputs from './components/color-inputs.vue';
import ColorList from './components/color-list.vue';
import ColorToolbar from './components/color-toolbar.vue';
import GradientControls from './components/gradient-controls.vue';
import GradientSlider from './components/gradient-slider.vue';
import HueAlphaSliders from './components/hue-alpha-sliders.vue';
import ModePicker from './components/mode-picker.vue';
import Saturation from './components/saturation.vue';
import { useDarkDetector, useI18n, useLocaleDetector, useTailwindV3Theme } from './composables';
import { DEFAULT_GRADIENT_STOPS, SWATCH_COLORS } from './constants';
import { loadLocaleMessages, localeLoaded } from './locales';
import { isClient, parseGradient } from './utils';

extend([cmykPlugin]);

export default {
  name: 'VcpColorPicker',
  components: {
    ColorInputs,
    ColorList,
    ColorToolbar,
    GradientControls,
    GradientSlider,
    HueAlphaSliders,
    ModePicker,
    Saturation,
  },
  props: {
    value: {
      type: String,
      default: '',
    },
    defaultValue: {
      type: String,
      default: undefined,
    },
    colorModes: {
      type: Array,
      default: () => ['monochrome', 'linear-gradient', 'radial-gradient'],
    },
    format: {
      type: String,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    enableModePicker: {
      type: Boolean,
      default: true,
    },
    enableFormatPicker: {
      type: Boolean,
      default: true,
    },
    enableInput: {
      type: Boolean,
      default: true,
    },
    enableAlpha: {
      type: Boolean,
      default: true,
    },
    enableEyeDrop: {
      type: Boolean,
      default: true,
    },
    recentColors: {
      type: [Boolean, Array],
    },
    swatchColors: {
      type: [Boolean, Array],
      default: () => [],
    },
    locale: {
      type: [String, Object],
      default: undefined,
    },
    themeElement: {
      type: Function,
      default: undefined,
    },
    horizontal: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const valueModel = computed({
      get: () => props.value,
      set: (value) => emit('update:value', value),
    });
    // 受控 + 内部回退：父级绑定 format 时走 prop，未绑定时用内部状态（对齐 Vue 3 defineModel 行为）
    const internalFormat = ref(props.format !== undefined ? props.format : 'HEX');
    const formatModel = computed({
      get: () => (props.format !== undefined ? props.format : internalFormat.value),
      set: (value) => {
        internalFormat.value = value;
        emit('update:format', value);
      },
    });
    const internalRecentColors = ref(Array.isArray(props.recentColors) ? props.recentColors : []);
    const recentColorsModel = computed({
      get: () =>
        props.recentColors !== undefined ? props.recentColors : internalRecentColors.value,
      set: (value) => {
        internalRecentColors.value = value;
        emit('update:recentColors', value);
      },
    });

    const { locale: localeProp } = toRefs(props);

    const { cssVariables } = useTailwindV3Theme({ element: props.themeElement });
    const { isDark } = useDarkDetector(undefined);
    const { locale } = useLocaleDetector(localeProp);
    const { t } = useI18n();

    const currentColorMode = ref(props.colorModes[0] ?? 'monochrome');
    const selectedStopId = ref(1);

    const gradientConfig = ref({
      angle: 90,
      positionX: 0,
      positionY: 50,
      stops: DEFAULT_GRADIENT_STOPS.map((stop) => ({
        id: stop.id,
        percentage: stop.percentage,
        color: colord(stop.color),
      })),
    });

    const stopsMap = computed(() => {
      return new Map(gradientConfig.value.stops.map((stop) => [stop.id, stop]));
    });

    const parseColor = () => {
      const colorValue = valueModel.value || props.defaultValue;
      if (!colorValue) return colord(DEFAULT_GRADIENT_STOPS[0].color);

      const gradientResult = parseGradient(colorValue);
      if (gradientResult) {
        currentColorMode.value = gradientResult.mode;
        gradientConfig.value = gradientResult.config;

        const currentStopExists = stopsMap.value.has(selectedStopId.value);
        if (!currentStopExists) {
          selectedStopId.value = gradientResult.config.stops[0]?.id || 1;
        }

        return (
          stopsMap.value.get(selectedStopId.value)?.color ||
          gradientResult.config.stops[0]?.color ||
          DEFAULT_GRADIENT_STOPS[0].color
        );
      }

      return colord(colorValue);
    };

    const currentColor = ref(parseColor());
    // 面板打开时的原始色值（保留渐变字符串），供恢复原始颜色预览使用
    const originalColorValue = ref(
      valueModel.value || props.defaultValue || generateColor(currentColor.value)
    );

    const eyeDropEnabled = computed(
      () => props.enableEyeDrop && isClient() && 'EyeDropper' in window
    );

    const hasControls = computed(() => {
      return props.enableModePicker || props.enableFormatPicker || eyeDropEnabled.value;
    });

    const gradientColor = computed(() => {
      if (currentColorMode.value === 'monochrome') return '';

      const stops = [...gradientConfig.value.stops]
        .sort((a, b) => a.percentage - b.percentage)
        .map((stop) => `${generateColor(stop.color)} ${stop.percentage}%`)
        .join(', ');

      if (currentColorMode.value === 'linear-gradient')
        return `linear-gradient(${gradientConfig.value.angle}deg, ${stops})`;

      if (currentColorMode.value === 'radial-gradient')
        return `radial-gradient(circle at ${gradientConfig.value.positionX}% ${gradientConfig.value.positionY}%, ${stops})`;

      return '';
    });

    const color = computed(() =>
      currentColorMode.value === 'monochrome'
        ? generateColor(currentColor.value)
        : gradientColor.value
    );

    const swatchColorList = computed(() => {
      if (props.swatchColors === false) return [];
      if (props.swatchColors === true) return SWATCH_COLORS;
      return Array.isArray(props.swatchColors) ? props.swatchColors : [];
    });

    const enableRecentColors = computed(() => props.recentColors !== false);
    const _recentColors = computed({
      get: () => (Array.isArray(recentColorsModel.value) ? recentColorsModel.value : []),
      set: (value) => {
        recentColorsModel.value = value;
      },
    });

    function generateColor(c) {
      switch (formatModel.value) {
        case 'HEX':
          return c.toHex();
        case 'RGB':
          return c.toRgbString();
        case 'HSL':
          return c.toHslString();
        case 'CMYK':
          return c.toCmykString();
        default:
          return c.toRgbString();
      }
    }

    // 恢复为打开面板时的原始颜色：直接写回 input 的绑定值，
    // 已有的 watch(valueModel) + parseColor() 会自动联动渐变/单色状态
    function restoreOriginalColor() {
      if (originalColorValue.value) {
        valueModel.value = originalColorValue.value;
      }
    }

    function handleRecentColorsChange(value) {
      recentColorsModel.value = value;
      emit('recentColorsChange', value);
    }

    onMounted(() => {
      if (props.locale !== 'en-US') loadLocaleMessages(locale.value);
    });

    watch(valueModel, () => {
      currentColor.value = parseColor();
    });
    watch(color, () => {
      valueModel.value = color.value;
    });
    watch(locale, () => loadLocaleMessages(locale.value));

    return {
      localeLoaded,
      isDark,
      cssVariables,
      t,
      currentColorMode,
      selectedStopId,
      gradientConfig,
      stopsMap,
      currentColor,
      eyeDropEnabled,
      hasControls,
      gradientColor,
      color,
      swatchColorList,
      enableRecentColors,
      valueModel,
      formatModel,
      _recentColors,
      originalColorValue,
      restoreOriginalColor,
      handleRecentColorsChange,
    };
  },
};
</script>

<style>
@import './style.css';

.color-palette {
  --default-transition-duration: 150ms;

  background-color: var(--popover);
  border: 1px solid var(--border);

  display: flex;
  flex-direction: column;
  width: 320px;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
}

.color-palette * {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 0 solid;
}

.color-palette[data-disabled='true'] {
  cursor: not-allowed;
}

.color-palette[data-disabled='true'] * {
  pointer-events: none;
}

.color-palette [data-color-palette='controls-container'] {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 面板主体：列式排布，保证子元素之间始终有间距 */
.color-palette [data-color-palette='panel-body'] {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.color-palette [data-color-palette='panel-body'] input {
  font-size: 14px;
}

/* 左右结构：saturation 固定在左，其余内容在右，面板整体变矮以适配有限的垂直空间 */
.color-palette.is-horizontal {
  flex-direction: row;
  align-items: stretch;
  width: 550px;
}

.color-palette.is-horizontal [data-color-palette='saturation'] {
  flex-shrink: 0;
  align-self: stretch;
  width: 220px;
  height: auto;
}

.color-palette.is-horizontal [data-color-palette='panel-body'] {
  flex: 1;
  min-width: 0;
}
</style>
