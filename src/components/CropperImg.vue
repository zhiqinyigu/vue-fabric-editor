<template>
  <div v-if="isOne && type === 'image'" class="cropper-img-wrap">
    <Tooltip :content="$t('cropperImg')" placement="top">
      <Button long type="text" @click="cropper">
        <CropIcon width="18" height="18"></CropIcon>
      </Button>
    </Tooltip>
    <CropperDialog ref="cropperDialogRef"></CropperDialog>
  </div>
</template>

<script>
import { ref, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';

import CropperDialog from '@/components/CropperDialog.vue';
import { Utils } from '@/core/index';
import CropIcon from '@/assets/icon/tools/crop.svg';

export default {
  name: 'CropperImg',
  components: { CropperDialog, CropIcon },
  setup() {
    const { insertImgFile } = Utils;

    const update = getCurrentInstance();
    // const canvasEditor = inject('canvasEditor');
    const { canvasEditor, isOne } = useSelect();
    const type = ref('');
    const cropperDialogRef = ref();
    const cropper = () => {
      console.log('🚀 ~ cropper ~ cropper:');
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject && activeObject.type === 'image') {
        console.log('🚀 ~ cropper ~ activeObject:', activeObject);
        cropperDialogRef.value.open({ img: activeObject._element.src }, async (data) => {
          console.log('🚀 ~ cropper ~ data:', data);
          const imgEl = await insertImgFile(data);
          // const width = activeObject.get('width');
          // const height = activeObject.get('height');
          // const scaleX = activeObject.get('scaleX');
          // const scaleY = activeObject.get('scaleY');
          // console.log('🚀 ~ cropper ~ scaleX:', scaleX);
          // console.log('🚀 ~ cropper ~ scaleY:', scaleY);
          activeObject.setSrc(imgEl.src, () => {
            // activeObject.set('scaleX', scaleX);
            // activeObject.set('scaleY', scaleY);
            canvasEditor.canvas.renderAll();
          });
          imgEl.remove();
        });
      }
    };

    const init = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        type.value = activeObject.type;
        update?.proxy?.$forceUpdate();
      }
    };

    onMounted(() => {
      canvasEditor.on('selectOne', init);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectOne', init);
    });

    return {
      isOne,
      type,
      cropper,
      cropperDialogRef,
    };
  },
};
</script>
<style lang="less" scoped>
// 在 .bg-item 工具条中等宽占位
.cropper-img-wrap {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
}
</style>
