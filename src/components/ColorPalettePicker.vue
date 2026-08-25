<!--
 * @Author: cyc
 * @Date: 2026-08-25 15:43:18
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 15:43:18
 * 定制版调色板选择器
 * 基于 vue-color-palette-vue2 的 ColorPickerTrigger 封装：
 * - 开启 recentColors 历史颜色
 * - 通过 localStorage 持久化，刷新/跨页保留
-->
<template>
  <div class="color-palette-picker">
    <ColorPickerTrigger
      :value.sync="valueModel"
      :format.sync="formatModel"
      :color-modes="colorModes"
      :enable-mode-picker="enableModePicker"
      :enable-format-picker="enableFormatPicker"
      :enable-input="enableInput"
      :show-input="showInput"
      :enable-alpha="enableAlpha"
      :enable-eye-drop="enableEyeDrop"
      :placement="placement"
      :enable-fallback="enableFallback"
      :recent-colors.sync="recentColorsModel"
      :swatch-colors="swatchColors"
      :placeholder="placeholder"
      @recent-colors-change="handleRecentColorsChange"
    />
  </div>
</template>

<script>
import { computed, ref, watch } from '@vue/composition-api';
import { ColorPickerTrigger } from '@/components/vue-color-palette-vue2';

const STORAGE_KEY = 'color-palette:recent-colors';
const MAX_RECENT_COLORS = 20;

function loadRecentColors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, MAX_RECENT_COLORS) : [];
  } catch (e) {
    return [];
  }
}

function persistRecentColors(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT_COLORS)));
  } catch (e) {
    /* 忽略隐私模式 / 配额限制导致的写入失败 */
  }
}

export default {
  name: 'ColorPalettePicker',
  components: {
    ColorPickerTrigger,
  },
  props: {
    value: {
      type: String,
      default: '',
    },
    format: {
      type: String,
      default: 'HEX',
    },
    colorModes: {
      type: Array,
      default: () => ['monochrome', 'linear-gradient', 'radial-gradient'],
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
    showInput: {
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
    placement: {
      type: String,
      default: 'bottom-end',
    },
    enableFallback: {
      type: Boolean,
      default: true,
    },
    swatchColors: {
      type: [Boolean, Array],
      default: () => [],
    },
    placeholder: {
      type: String,
      default: '',
    },
    recentColors: {
      type: Array,
      default: null,
    },
  },
  setup(props, { emit }) {
    // 双向绑定：同时派发 update:value（供 .sync）与 change（语义化事件）
    const valueModel = computed({
      get: () => props.value,
      set: (value) => {
        emit('update:value', value);
        emit('change', value);
      },
    });
    // 输出格式（受控 + 内部回退）：默认 HEX 丢弃 alpha，改 RGB 可输出 rgba 保留透明度。
    // 以内部状态为准（父级显式变更 format 时经 watch 同步覆盖），
    // 避免父级未绑定 format 时（取默认值 'HEX'）把用户已选的格式回退掉。
    const internalFormat = ref(props.format !== undefined ? props.format : 'HEX');
    watch(
      () => props.format,
      (value) => {
        if (value !== undefined) internalFormat.value = value;
      }
    );
    const formatModel = computed({
      get: () => internalFormat.value,
      set: (value) => {
        internalFormat.value = value;
        emit('update:format', value);
      },
    });
    // 历史颜色：受控 + 内部回退 + 持久化
    const recentRef = ref(
      Array.isArray(props.recentColors) ? props.recentColors : loadRecentColors()
    );
    const recentColorsModel = computed({
      get: () => recentRef.value,
      set: (list) => {
        const capped = Array.isArray(list) ? list.slice(0, MAX_RECENT_COLORS) : [];
        recentRef.value = capped;
        persistRecentColors(capped);
      },
    });

    function handleRecentColorsChange(list) {
      if (Array.isArray(list)) {
        recentRef.value = list.slice(0, MAX_RECENT_COLORS);
        persistRecentColors(recentRef.value);
      }
      emit('recentColorsChange', list);
    }

    return {
      valueModel,
      formatModel,
      recentColorsModel,
      handleRecentColorsChange,
    };
  },
};
</script>

<style scoped lang="less">
/* trigger 容器同样由 inline-block 收缩改为块级撑满，input 才能跟随伸缩 */
.color-palette-picker {
  &,
  /deep/ .color-palette-trigger {
    display: block;
    width: 100%;
  }
}
</style>
