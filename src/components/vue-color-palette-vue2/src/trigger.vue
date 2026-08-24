<template>
  <div class="color-palette-trigger" :class="[isDark ? 'dark' : 'light']" :style="cssVariables">
    <div
      ref="referenceEl"
      class="color-palette-trigger__trigger"
      :data-disabled="disabled"
      data-color-palette="trigger"
      @click="!disabled && onClick()"
    >
      <div data-color-palette="trigger-preview" :data-disabled="disabled">
        <div :style="{ background: valueModel }"></div>
      </div>

      <input
        v-if="showInput"
        :value="valueModel"
        type="text"
        readonly
        :placeholder="placeholder"
        :disabled="disabled"
        data-color-palette="trigger-input"
      />
    </div>

    <!-- 弹层作为参考元素（带 @click toggle）的兄弟节点，避免面板内点击冒泡触发关闭 -->
    <div v-if="open" ref="floatingEl" data-color-palette="trigger-popup" :style="floatingStyle">
      <ColorPicker
        v-bind="$props"
        :horizontal="horizontal"
        :value.sync="valueModel"
        :format.sync="formatModel"
        :recent-colors.sync="recentColorsModel"
        @recent-colors-change="handleRecentColorsChange"
      />
    </div>
  </div>
</template>

<script>
import { computed, ref, watch } from '@vue/composition-api';
import { useDarkDetector, useFloating, useTailwindV3Theme } from './composables';
import ColorPicker from './index.vue';

export default {
  name: 'VcpColorPickerTrigger',
  components: { ColorPicker },
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
    enableAutoLayout: {
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
    placeholder: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const valueModel = computed({
      get: () => props.value,
      set: (value) => {
        // 同时发射 input 与 update:value，兼容 Vue 2 的 v-model（监听 input）与 .sync（监听 update:value）
        emit('input', value);
        emit('update:value', value);
      },
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

    const { cssVariables } = useTailwindV3Theme({ element: props.themeElement });
    const { isDark } = useDarkDetector(undefined);

    const { referenceEl, floatingEl, open, floatingStyle, updatePosition, onClick, horizontal } =
      useFloating({
        placement: () => props.placement,
        enableFallback: () => props.enableFallback,
        enableAutoLayout: () => props.enableAutoLayout,
      });

    // placement 或开关变化且面板打开时，重新计算定位
    watch(
      () => props.placement,
      () => {
        if (open.value) updatePosition();
      }
    );
    watch(
      () => props.enableFallback,
      () => {
        if (open.value) updatePosition();
      }
    );

    function handleRecentColorsChange(colors) {
      emit('recentColorsChange', colors);
    }

    return {
      isDark,
      cssVariables,
      referenceEl,
      floatingEl,
      open,
      floatingStyle,
      onClick,
      horizontal,
      valueModel,
      formatModel,
      recentColorsModel,
      handleRecentColorsChange,
    };
  },
};
</script>

<style>
.color-palette-trigger {
  display: inline-block;
}

.color-palette-trigger [data-color-palette='trigger'] {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: var(--muted);
  height: 40px;
  width: 100%;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.color-palette-trigger [data-color-palette='trigger'][data-disabled='true'] {
  cursor: not-allowed;
}

.color-palette-trigger [data-color-palette='trigger'][data-disabled='true'] * {
  pointer-events: none;
}

.color-palette-trigger [data-color-palette='trigger-preview'] {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==);
  background-repeat: repeat;
}

.color-palette-trigger [data-color-palette='trigger-preview'] > div {
  width: 100%;
  height: 100%;
}

.color-palette-trigger [data-color-palette='trigger-preview'][data-disabled='true'] {
  cursor: not-allowed;
}

.color-palette-trigger [data-color-palette='trigger-input'] {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--foreground);
}

.color-palette-trigger [data-color-palette='trigger-input']:disabled {
  cursor: not-allowed;
}

.color-palette-trigger [data-color-palette='trigger-input']::placeholder {
  color: var(--muted-foreground);
}

.color-palette-trigger [data-color-palette='trigger-popup'] {
  z-index: 1000;
}
</style>
