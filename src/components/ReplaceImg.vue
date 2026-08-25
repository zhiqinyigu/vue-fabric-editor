<!--
 * @Author: 秦少卫
 * @Date: 2023-04-06 22:26:57
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:15:32
 * @Description: 图片替换
-->

<template>
  <Tooltip v-if="isOne && type === 'image'" placement="top" :content="$t('repleaceImg')">
    <Button long type="text" @click="repleace">
      <ReplaceIcon width="18" height="18"></ReplaceIcon>
    </Button>
  </Tooltip>
</template>

<script>
import { ref, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';

import { Utils } from '@/core/index';
import ReplaceIcon from '@/assets/icon/tools/replaceImg.svg';

export default {
  name: 'ReplaceImg',
  components: { ReplaceIcon },
  setup() {
    const { getImgStr, selectFiles, insertImgFile } = Utils;

    const update = getCurrentInstance();
    // const canvasEditor = inject('canvasEditor');
    const { canvasEditor, isOne } = useSelect();
    const type = ref('');

    // 替换图片
    const repleace = async () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject && activeObject.type === 'image') {
        // 图片
        const [file] = await selectFiles({ accept: 'image/*', multiple: false });
        // 转字符串
        const fileStr = await getImgStr(file);
        // 字符串转El
        const imgEl = await insertImgFile(fileStr);
        const width = activeObject.get('width');
        const height = activeObject.get('height');
        const scaleX = activeObject.get('scaleX');
        const scaleY = activeObject.get('scaleY');
        activeObject.setSrc(imgEl.src, () => {
          activeObject.set('scaleX', (width * scaleX) / imgEl.width);
          activeObject.set('scaleY', (height * scaleY) / imgEl.height);
          activeObject.set('originSrc', imgEl.src);
          canvasEditor.canvas.renderAll();
        });
        imgEl.remove();
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
      repleace,
    };
  },
};
</script>
