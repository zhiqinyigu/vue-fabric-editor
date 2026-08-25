<template>
  <Tooltip v-if="isSelect" :content="$t('quick.copy')">
    <Button long icon="ios-copy" type="text" @click="clone"></Button>
  </Tooltip>
</template>

<script>
import useSelect from '@/hooks/select';
import { debounce } from 'lodash-es';

export default {
  name: 'Clone',
  setup() {
    const { canvasEditor, isSelect } = useSelect();
    const clone = debounce(function () {
      canvasEditor.clone();
    }, 300);

    return {
      isSelect,
      clone,
    };
  },
};
</script>
