<template>
  <div data-color-palette="color-toolbar">
    <EyeDropper v-if="enableEyeDrop" :color.sync="colorModel" :enable-eye-drop="enableEyeDrop" />
    <FormatPicker v-if="enableFormatPicker" :format.sync="formatModel" />
  </div>
</template>

<script>
import { computed } from '@vue/composition-api';
import EyeDropper from './eye-dropper.vue';
import FormatPicker from './format-picker.vue';

export default {
  name: 'VcpColorToolbar',
  components: { EyeDropper, FormatPicker },
  props: {
    enableEyeDrop: {
      type: Boolean,
      default: true,
    },
    enableFormatPicker: {
      type: Boolean,
      default: true,
    },
    format: {
      type: String,
      required: true,
      default: 'HEX',
    },
    color: {
      type: Object,
      required: true,
    },
  },
  setup(props, { emit }) {
    const formatModel = computed({
      get: () => props.format,
      set: (value) => emit('update:format', value),
    });
    const colorModel = computed({
      get: () => props.color,
      set: (value) => emit('update:color', value),
    });

    return { formatModel, colorModel };
  },
};
</script>

<style>
.color-palette [data-color-palette='color-toolbar'] {
  display: inline-flex;
  height: 28px;
  display: flex;
  border-radius: 4px;
  background-color: var(--muted);
  color: var(--muted-foreground);
}
</style>
