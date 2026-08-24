<template>
  <Button @click="handleEyeDrop">
    <ColorPickerIcon />
  </Button>
</template>

<script>
import { computed } from '@vue/composition-api';
import { colord } from 'colord';
import { isClient } from '../utils';
import { Button, Icon } from './common';

export default {
  name: 'VcpEyeDropper',
  components: { Button, ColorPickerIcon: Icon.ColorPicker },
  props: {
    color: {
      type: Object,
      required: true,
    },
  },
  setup(props, { emit }) {
    const colorModel = computed({
      get: () => props.color,
      set: (value) => emit('update:color', value),
    });

    function handleEyeDrop() {
      if (!isClient() || !('EyeDropper' in window)) return;

      // experimental API
      const eyeDropper = new window.EyeDropper();
      eyeDropper
        .open()
        .then((result) => {
          colorModel.value = colord(result.sRGBHex);
        })
        .catch(() => {});
    }

    return { colorModel, handleEyeDrop };
  },
};
</script>
