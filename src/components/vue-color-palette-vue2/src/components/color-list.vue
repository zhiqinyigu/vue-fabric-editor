<template>
  <Collapse :title="label">
    <template v-if="enableActions" slot="actions">
      <Button v-if="enableAddColor" @click="handleAddColor">
        <PlusIcon />
      </Button>
      <Button v-if="enableRemoveColor && colorsModel.length > 0" @click="handleRemoveColor">
        <TrashIcon />
      </Button>
    </template>

    <div data-color-palette="color-list">
      <div
        v-for="item in colorsModel"
        :key="item"
        data-color-palette="color-list-item"
        :style="{ background: item }"
        @click="handleSelect(item)"
      />
    </div>
  </Collapse>
</template>

<script>
import { ref, computed } from '@vue/composition-api';
import { detectColorMode } from '../utils';
import { Button, Collapse, Icon } from './common';

export default {
  name: 'VcpColorList',
  components: {
    Button,
    Collapse,
    PlusIcon: Icon.Plus,
    TrashIcon: Icon.Trash,
  },
  props: {
    label: {
      type: String,
      default: undefined,
    },
    enableAddColor: {
      type: Boolean,
      default: false,
    },
    enableRemoveColor: {
      type: Boolean,
      default: false,
    },
    value: {
      type: String,
      required: true,
    },
    colors: {
      type: Array,
    },
    colorMode: {
      type: String,
      required: true,
    },
  },
  emits: ['update:value', 'update:colors', 'update:colorMode'],
  setup(props, { emit }) {
    const valueModel = computed({
      get: () => props.value,
      set: (value) => emit('update:value', value),
    });
    // 受控 + 内部回退：父级绑定 colors 时走 prop，未绑定时用内部状态
    const internalColors = ref(Array.isArray(props.colors) ? props.colors : []);
    const colorsModel = computed({
      get: () => (props.colors !== undefined ? props.colors : internalColors.value),
      set: (value) => {
        internalColors.value = value;
        emit('update:colors', value);
      },
    });
    const colorModeModel = computed({
      get: () => props.colorMode,
      set: (value) => emit('update:colorMode', value),
    });

    const enableActions = computed(() => props.enableAddColor || props.enableRemoveColor);

    function handleSelect(item) {
      const detectedMode = detectColorMode(item);
      if (colorModeModel.value !== detectedMode) colorModeModel.value = detectedMode;

      valueModel.value = item;
    }

    function handleAddColor() {
      const colorToAdd = valueModel.value;
      if (colorToAdd && !colorsModel.value.includes(colorToAdd))
        colorsModel.value = [...colorsModel.value, colorToAdd];
    }

    function handleRemoveColor() {
      const colorToRemove = valueModel.value;
      if (colorToRemove) {
        colorsModel.value = colorsModel.value.filter(
          (item) => item.toLowerCase() !== colorToRemove.toLowerCase()
        );
      }
    }

    return {
      valueModel,
      colorsModel,
      colorModeModel,
      enableActions,
      handleSelect,
      handleAddColor,
      handleRemoveColor,
    };
  },
};
</script>

<style>
.color-palette [data-color-palette='color-list'] {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.color-palette [data-color-palette='color-list-item'] {
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}

.color-palette [data-color-palette='color-list-item']:hover {
  transform: scale(1.15);
  transition-duration: var(--default-transition-duration);
}
</style>
