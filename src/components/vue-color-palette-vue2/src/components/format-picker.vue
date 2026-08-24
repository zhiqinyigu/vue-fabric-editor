<template>
  <div data-color-palette="format-picker">
    <span ref="referenceEl" @click="onClick">
      <Button>
        <div data-color-palette="format-picker-label">
          {{ formatModel }}
        </div>
        <ChevronDownIcon />
      </Button>
    </span>

    <div
      v-if="open"
      ref="floatingEl"
      data-color-palette="format-picker-dropdown"
      :style="floatingStyle"
      @click.stop
    >
      <Button
        v-for="choice in COLOR_FORMAT_CHOICES"
        :key="choice"
        :data-active="formatModel === choice"
        @click.stop="handleSelect(choice)"
      >
        {{ choice }}
      </Button>
    </div>
  </div>
</template>

<script>
import { computed } from '@vue/composition-api';
import { useFloating } from '../composables';
import { COLOR_FORMAT_CHOICES } from '../constants';
import { Button, Icon } from './common';

export default {
  name: 'VcpFormatPicker',
  components: { Button, ChevronDownIcon: Icon.ChevronDown },
  props: {
    format: {
      type: String,
      required: true,
      default: 'HEX',
    },
  },
  setup(props, { emit }) {
    const formatModel = computed({
      get: () => props.format,
      set: (value) => emit('update:format', value),
    });

    const { referenceEl, floatingEl, open, floatingStyle, onClick } = useFloating({});

    function handleSelect(value) {
      formatModel.value = value;
      open.value = false;
    }

    return {
      formatModel,
      referenceEl,
      floatingEl,
      open,
      floatingStyle,
      onClick,
      handleSelect,
      COLOR_FORMAT_CHOICES,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='format-picker'] {
  height: 100%;
  display: inline-flex;
  align-items: center;
}

.color-palette [data-color-palette='format-picker-dropdown'] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background-color: var(--popover);
  border: 1px solid var(--border);
  border-radius: 4px;
  z-index: 1000;
  min-width: 64px;
}

.color-palette [data-color-palette='format-picker-dropdown'] [data-active='true'] {
  background-color: var(--accent);
  color: var(--accent-foreground);
}
.color-palette [data-color-palette='format-picker-label'] {
  padding-top: 1px;
}
</style>
