<template>
  <div v-if="isSegmented" data-color-palette="mode-picker">
    <Button
      v-for="option in modeOptions"
      :key="option.value"
      :data-active="colorModeModel === option.value"
      :value="option.value"
      @click="colorModeModel = option.value"
    >
      {{ option.label }}
    </Button>
  </div>
</template>

<script>
import { computed, watch } from '@vue/composition-api';
import { useI18n } from '../composables';
import { Button } from './common';

export default {
  name: 'VcpModePicker',
  components: { Button },
  props: {
    colorModes: {
      type: Array,
      default: () => ['monochrome', 'linear-gradient', 'radial-gradient'],
    },
    colorMode: {
      type: String,
      required: true,
      default: 'monochrome',
    },
  },
  setup(props, { emit }) {
    const { t } = useI18n();

    const colorModeModel = computed({
      get: () => props.colorMode,
      set: (value) => emit('update:colorMode', value),
    });

    const modeOptions = computed(() => {
      return props.colorModes.map((mode) => ({
        label: t(`button.${mode}`),
        value: mode,
      }));
    });

    const colorModeInOptions = computed(() =>
      modeOptions.value.find((option) => option.value === colorModeModel.value)
    );

    const isSegmented = computed(() => props.colorModes.length > 1);

    watch(
      colorModeInOptions,
      () => {
        if (!colorModeInOptions.value) colorModeModel.value = props.colorModes[0] ?? 'monochrome';
      },
      { immediate: true }
    );

    return { colorModeModel, modeOptions, isSegmented };
  },
};
</script>

<style>
.color-palette [data-color-palette='mode-picker'] {
  display: inline-flex;
  height: 28px;
  width: fit-content;
  align-items: center;
  padding: 3px;
  border-radius: 4px;
  background-color: var(--muted);
  color: var(--muted-foreground);
}

.color-palette [data-color-palette='mode-picker'] [data-color-palette='button'] {
  height: 100%;
  padding-inline: 8px;
  font-size: 12px;
  border-radius: 4px;
}

.color-palette [data-color-palette='mode-picker'] [data-active='true'] {
  background-color: var(--background);
  color: var(--foreground);
  box-shadow: rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px,
    rgba(0, 0, 0, 0.1) 0px 1px 3px 0px, rgba(0, 0, 0, 0.1) 0px 1px 2px -1px;
}
</style>
