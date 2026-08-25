<script>
import useSelect from '@/hooks/select';
import { Message } from 'view-design';

export default {
  name: 'Edit',
  setup() {
    const { isMatchType, canvasEditor } = useSelect(['polygon']);
    const onEditPolygon = () => {
      const obj = canvasEditor.fabricCanvas?.getActiveObject();
      if (obj && obj.type === 'polygon') {
        canvasEditor.activeEdit();
      } else {
        Message.warning('请检查选择polygon');
      }
    };

    return {
      isMatchType,
      onEditPolygon,
    };
  },
};
</script>

<template>
  <Tooltip v-if="isMatchType" :content="$t('quick.editPoly')">
    <Button long icon="md-brush" type="text" @click="onEditPolygon"></Button>
  </Tooltip>
</template>

<style scoped lang="less"></style>
