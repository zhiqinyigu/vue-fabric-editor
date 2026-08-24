<template>
  <div data-color-palette="hue-alpha-sliders-container">
    <div data-color-palette="hue-alpha-inner">
      <Slider
        :value.sync="hue"
        data-color-palette="hue-slider"
        max="360"
        step="0.1"
        :thumb-color="hueColor"
      />

      <div v-if="enableAlpha" class="alpha" data-color-palette="alpha-slider-container">
        <Slider
          :value.sync="alpha"
          data-color-palette="alpha-slider"
          :thumb-color="rgbColor"
          :style="{
            background: backgroundGradient,
          }"
        />
      </div>
    </div>

    <div data-color-palette="color-preview">
      <div class="alpha">
        <div
          data-color-palette="color-preview-inner"
          :style="{
            background: preview,
          }"
          @click="copyCurrentColor"
        />
      </div>
      <div v-if="copiedText" data-color-palette="copy-tooltip">
        {{ t('text.copied') }}: {{ copiedText }}
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, ref } from '@vue/composition-api';
import { colord } from 'colord';
import { Slider } from './common';
import { useI18n } from '../composables';
import { copyText } from '../utils';

export default {
  name: 'VcpHueAlphaSliders',
  components: { Slider },
  props: {
    previewColor: {
      type: String,
      default: undefined,
    },
    enableAlpha: {
      type: Boolean,
      default: true,
    },
    color: {
      type: Object,
      required: true,
    },
  },
  setup(props, { emit }) {
    const { t } = useI18n();

    const copiedText = ref('');
    let copyTimer = null;

    const colorModel = computed({
      get: () => props.color,
      set: (value) => emit('update:color', value),
    });

    const hue = computed({
      get: () => {
        const hsv = colorModel.value.toHsv();
        return hsv.h || 0;
      },
      set: (value) => {
        const hsv = colorModel.value.toHsv();
        colorModel.value = colord({
          h: value,
          s: hsv.s,
          v: hsv.v,
          a: hsv.a,
        });
      },
    });

    const hueColor = computed(() => {
      const hsv = colorModel.value.toHsv();
      return colord({
        h: hsv.h,
        s: 100,
        v: 100,
        a: 1,
      }).toRgbString();
    });

    const alpha = computed({
      get: () => {
        const rgba = colorModel.value.toRgb();
        return (rgba.a ?? 1) * 100;
      },
      set: (value) => {
        const rgba = colorModel.value.toRgb();
        colorModel.value = colord({
          r: rgba.r,
          g: rgba.g,
          b: rgba.b,
          a: value / 100,
        });
      },
    });

    const rgbColor = computed(() => colorModel.value.toRgbString());

    const backgroundGradient = computed(
      () => `linear-gradient(90deg, transparent 0%, ${hueColor.value} 100%)`
    );

    const preview = computed(() => props.previewColor || hueColor.value);

    function copyCurrentColor() {
      // 优先复制父级按当前格式生成的色值，未传时退回完整 rgba
      const value = props.previewColor || colorModel.value.toRgbaString();
      copyText(value);
      copiedText.value = value;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copiedText.value = '';
      }, 2000);
    }

    onBeforeUnmount(() => {
      clearTimeout(copyTimer);
    });

    return {
      t,
      copiedText,
      hue,
      hueColor,
      alpha,
      rgbColor,
      backgroundGradient,
      preview,
      copyCurrentColor,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='hue-alpha-sliders-container'] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.color-palette [data-color-palette='hue-alpha-inner'] {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.color-palette [data-color-palette='hue-slider'] {
  background: linear-gradient(
    to right,
    #ff0000 0%,
    #ffff00 17%,
    #00ff00 33%,
    #00ffff 50%,
    #0000ff 67%,
    #ff00ff 83%,
    #ff0000 100%
  );
}

.color-palette [data-color-palette='alpha-slider-container'] {
  position: relative;
  height: 12px;
  border-radius: 6px;
}
.color-palette [data-color-palette='alpha-slider'] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.color-palette [data-color-palette='color-preview'] {
  position: relative;
  flex-shrink: 0;
  height: 40px;
  width: 40px;
  border: 1px solid var(--border);
  margin-left: 4px;
}
.color-palette [data-color-palette='color-preview'] .alpha {
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
.color-palette [data-color-palette='color-preview'] [data-color-palette='color-preview-inner'] {
  height: 100%;
  width: 100%;
  cursor: pointer;
}
.color-palette [data-color-palette='copy-tooltip'] {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}
</style>
