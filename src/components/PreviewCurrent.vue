<!--
 * @Author: bigFace2019 599069310@qq.com
 * @Date: 2023-04-09 11:19:07
 * @LastEditors: 秦少卫
 * @LastEditTime: 2023-07-05 00:58:02
 * @FilePath: \vue-fabric-editor\src\components\preview.vue
 * @Description: 预览组件
-->
<template>
  <span>
    <Button type="text" @click="preview">
      {{ $t('preview') }}
    </Button>
    <Modal v-model="previewVisible" :title="$t('preview')" :footer-hide="true" width="80%">
      <div style="display: flex; justify-content: center; align-items: center">
        <img v-if="previewUrl" :src="previewUrl" style="max-width: 100%; max-height: 75vh" />
      </div>
    </Modal>
  </span>
</template>

<script>
import { inject, ref } from '@vue/composition-api';

export default {
  name: 'PreviewCurrent',
  setup() {
    const canvasEditor = inject('canvasEditor');

    const previewVisible = ref(false);
    const previewUrl = ref('');

    const preview = () => {
      canvasEditor.preview().then((dataUrl) => {
        // 导出失败（如画布被跨域图片污染）返回 null，此时已有 save:error toast，不弹空预览
        if (!dataUrl) return;
        previewUrl.value = dataUrl;
        previewVisible.value = true;
      });
    };

    return {
      preview,
      previewVisible,
      previewUrl,
    };
  },
};
</script>

<style scoped lang="less"></style>
