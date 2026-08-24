<template>
  <div data-color-palette="color-inputs">
    <template v-if="format === 'HEX'">
      <InputHex :value.sync="hexValue" />
      <InputNumber
        v-if="enableAlpha"
        :value.sync="alphaConfig.value.value"
        :label="alphaConfig.label"
        label-position="bottom"
      />
    </template>

    <template v-else-if="format === 'RGB'">
      <InputNumber
        v-for="config in inputConfigs.RGB"
        :key="config.label"
        :value.sync="config.value.value"
        :label="config.label"
        label-position="bottom"
        :max="config.max"
      />
      <InputNumber
        v-if="enableAlpha"
        :value.sync="alphaConfig.value.value"
        :label="alphaConfig.label"
        label-position="bottom"
      />
    </template>

    <template v-else-if="format === 'HSL'">
      <InputNumber
        v-for="config in inputConfigs.HSL"
        :key="config.label"
        :value.sync="config.value.value"
        :label="config.label"
        label-position="bottom"
        :max="config.max"
      />
      <InputNumber
        v-if="enableAlpha"
        :value.sync="alphaConfig.value.value"
        :label="alphaConfig.label"
        label-position="bottom"
      />
    </template>

    <template v-else-if="format === 'HSV'">
      <InputNumber
        v-for="config in inputConfigs.HSV"
        :key="config.label"
        :value.sync="config.value.value"
        :label="config.label"
        label-position="bottom"
        :max="config.max"
      />
      <InputNumber
        v-if="enableAlpha"
        :value.sync="alphaConfig.value.value"
        :label="alphaConfig.label"
        label-position="bottom"
      />
    </template>

    <template v-else-if="format === 'CMYK'">
      <InputNumber
        v-for="config in inputConfigs.CMYK"
        :key="config.label"
        :value.sync="config.value.value"
        :label="config.label"
        label-position="bottom"
      />
      <InputNumber
        v-if="enableAlpha"
        :value.sync="alphaConfig.value.value"
        :label="alphaConfig.label"
        label-position="bottom"
      />
    </template>

    <!-- 原始颜色预览：点击立即恢复为打开面板时的颜色 -->
    <div class="color-preview-container">
      <div data-color-palette="color-preview" title="恢复原始颜色">
        <div class="alpha">
          <div
            data-color-palette="color-preview-inner"
            :style="{ background: originalColor }"
            @click="restoreOriginal"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed } from '@vue/composition-api';
import { colord } from 'colord';
import { InputHex, InputNumber } from './common';

export default {
  name: 'VcpColorInputs',
  components: { InputHex, InputNumber },
  props: {
    format: {
      type: String,
      required: true,
    },
    enableAlpha: {
      type: Boolean,
      default: true,
    },
    color: {
      type: Object,
      required: true,
    },
    originalColor: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const colorModel = computed({
      get: () => props.color,
      set: (value) => emit('update:color', value),
    });

    const rgb = computed(() => colorModel.value.toRgb());
    const hsl = computed(() => colorModel.value.toHsl());
    const hsv = computed(() => colorModel.value.toHsv());
    const cmyk = computed(() => colorModel.value.toCmyk());

    const hexValue = computed({
      get: () => colorModel.value.toHex(),
      set: (value) => {
        const newColor = colord(value);
        if (newColor.isValid()) colorModel.value = newColor;
      },
    });

    const rgbValues = {
      r: computed({
        get: () => rgb.value.r,
        set: (value) => {
          colorModel.value = colord({
            r: value,
            g: rgb.value.g,
            b: rgb.value.b,
            a: rgb.value.a ?? 1,
          });
        },
      }),
      g: computed({
        get: () => rgb.value.g,
        set: (value) => {
          colorModel.value = colord({
            r: rgb.value.r,
            g: value,
            b: rgb.value.b,
            a: rgb.value.a ?? 1,
          });
        },
      }),
      b: computed({
        get: () => rgb.value.b,
        set: (value) => {
          colorModel.value = colord({
            r: rgb.value.r,
            g: rgb.value.g,
            b: value,
            a: rgb.value.a ?? 1,
          });
        },
      }),
    };

    const hslValues = {
      h: computed({
        get: () => Math.round(hsl.value.h || 0),
        set: (value) => {
          colorModel.value = colord({
            h: value,
            s: hsl.value.s,
            l: hsl.value.l,
            a: hsl.value.a ?? 1,
          });
        },
      }),
      s: computed({
        get: () => Math.round(hsl.value.s),
        set: (value) => {
          colorModel.value = colord({
            h: hsl.value.h || 0,
            s: value,
            l: hsl.value.l,
            a: hsl.value.a ?? 1,
          });
        },
      }),
      l: computed({
        get: () => Math.round(hsl.value.l),
        set: (value) => {
          colorModel.value = colord({
            h: hsl.value.h || 0,
            s: hsl.value.s,
            l: value,
            a: hsl.value.a ?? 1,
          });
        },
      }),
    };

    const hsvValues = {
      h: computed({
        get: () => Math.round(hsv.value.h || 0),
        set: (value) => {
          colorModel.value = colord({
            h: value,
            s: hsv.value.s,
            v: hsv.value.v,
            a: hsv.value.a ?? 1,
          });
        },
      }),
      s: computed({
        get: () => Math.round(hsv.value.s),
        set: (value) => {
          colorModel.value = colord({
            h: hsv.value.h || 0,
            s: value,
            v: hsv.value.v,
            a: hsv.value.a ?? 1,
          });
        },
      }),
      v: computed({
        get: () => Math.round(hsv.value.v),
        set: (value) => {
          colorModel.value = colord({
            h: hsv.value.h || 0,
            s: hsv.value.s,
            v: value,
            a: hsv.value.a ?? 1,
          });
        },
      }),
    };

    const cmykValues = {
      c: computed({
        get: () => Math.round(cmyk.value.c),
        set: (value) => {
          colorModel.value = colord({
            c: value,
            m: cmyk.value.m,
            y: cmyk.value.y,
            k: cmyk.value.k,
          });
        },
      }),
      m: computed({
        get: () => Math.round(cmyk.value.m),
        set: (value) => {
          colorModel.value = colord({
            c: cmyk.value.c,
            m: value,
            y: cmyk.value.y,
            k: cmyk.value.k,
          });
        },
      }),
      y: computed({
        get: () => Math.round(cmyk.value.y),
        set: (value) => {
          colorModel.value = colord({
            c: cmyk.value.c,
            m: cmyk.value.m,
            y: value,
            k: cmyk.value.k,
          });
        },
      }),
      k: computed({
        get: () => Math.round(cmyk.value.k),
        set: (value) => {
          colorModel.value = colord({
            c: cmyk.value.c,
            m: cmyk.value.m,
            y: cmyk.value.y,
            k: value,
          });
        },
      }),
    };

    const alpha = computed({
      get: () => Math.round((rgb.value.a ?? 1) * 100),
      set: (value) => {
        colorModel.value = colord({
          r: rgb.value.r,
          g: rgb.value.g,
          b: rgb.value.b,
          a: value / 100,
        });
      },
    });

    const inputConfigs = {
      RGB: [
        { value: rgbValues.r, label: 'R', max: 255 },
        { value: rgbValues.g, label: 'G', max: 255 },
        { value: rgbValues.b, label: 'B', max: 255 },
      ],
      HSL: [
        { value: hslValues.h, label: 'H', max: 360 },
        { value: hslValues.s, label: 'S' },
        { value: hslValues.l, label: 'L' },
      ],
      HSV: [
        { value: hsvValues.h, label: 'H', max: 360 },
        { value: hsvValues.s, label: 'S' },
        { value: hsvValues.v, label: 'V' },
      ],
      CMYK: [
        { value: cmykValues.c, label: 'C' },
        { value: cmykValues.m, label: 'M' },
        { value: cmykValues.y, label: 'Y' },
        { value: cmykValues.k, label: 'K' },
      ],
    };

    const alphaConfig = { value: alpha, label: 'A' };

    // 点击原始颜色预览，触发父级恢复为打开面板时的颜色（父级负责单色/渐变的解析）
    function restoreOriginal() {
      emit('restore');
    }

    return {
      hexValue,
      inputConfigs,
      alphaConfig,
      restoreOriginal,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='color-inputs'] {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: flex-start;
}

.color-palette [data-color-palette='color-inputs'] [data-color-palette='input-number-container'] {
  flex: 1;
}
.color-palette .color-preview-container {
  width: 40px;
  position: relative;
  flex-shrink: 0;
  margin-left: 4px;
}
/* 右侧为原始颜色预览预留空间与间距 */
.color-palette [data-color-palette='color-inputs'] [data-color-palette='color-preview'] {
  position: absolute;
  top: -13px;
  left: 0;
  width: 100%;
  height: 40px;
  border: 1px solid var(--border);
  margin: 0;
}
</style>
