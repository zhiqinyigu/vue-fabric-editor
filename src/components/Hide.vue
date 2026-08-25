<!--
 * @Author: wuchenguang1998
 * @Date: 2024-05-13 22:34:03
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:20:20
 * @Description: 隐藏或显示元素
-->

<template>
  <Tooltip v-if="isOne" :content="isHide ? $t('quick.show') : $t('quick.hide')">
    <Button
      v-if="isHide"
      long
      icon="md-eye-off"
      type="text"
      class="hide-active"
      @click="doHide(false)"
    ></Button>
    <Button v-else long icon="md-eye" type="text" @click="doHide(true)"></Button>
  </Tooltip>
</template>

<script>
import useSelect from '@/hooks/select';
import { ref, onBeforeUnmount, onMounted } from '@vue/composition-api';

export default {
  name: 'Hide',
  setup() {
    const { isOne, canvasEditor } = useSelect();
    const isHide = ref(false);

    const doHide = (hide) => {
      // 修改visible属性
      const activeObject = canvasEditor.canvas.getActiveObject();
      activeObject.set('visible', !hide);
      canvasEditor.canvas.requestRenderAll();
    };

    // 从当前活动对象真实属性派生状态（与 layer.vue 对齐）
    const syncState = () => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      isHide.value = activeObject ? !activeObject.visible : false;
    };

    onMounted(() => {
      canvasEditor.on('selectOne', syncState);
      // 监听画布渲染，确保来自 layer.vue 等其它入口的修改也能同步
      canvasEditor.canvas.on('after:render', syncState);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectOne', syncState);
      canvasEditor.canvas.off('after:render', syncState);
    });

    return {
      isOne,
      isHide,
      doHide,
    };
  },
};
</script>

<style scoped lang="less">
.hide-active {
  opacity: 0.5;
}
</style>
