<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:20:59
 * @Description: 锁定元素
-->

<template>
  <Tooltip v-if="isOne" :content="isLock ? $t('quick.unlock') : $t('quick.lock')">
    <Button
      v-if="isLock"
      long
      icon="md-lock"
      type="text"
      class="lock-active"
      @click="doLock(false)"
    ></Button>
    <Button v-else long icon="md-unlock" type="text" @click="doLock(true)"></Button>
  </Tooltip>
</template>

<script>
import useSelect from '@/hooks/select';
import { ref, onBeforeUnmount, onMounted } from '@vue/composition-api';

export default {
  name: 'Lock',
  setup() {
    const { canvasEditor, isOne } = useSelect();
    const isLock = ref(false);
    const doLock = (lock) => {
      lock ? canvasEditor.lock() : canvasEditor.unLock();
    };

    // 从当前活动对象真实属性派生状态（与 layer.vue 对齐）
    const syncState = () => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      isLock.value = activeObject ? !!activeObject.lockMovementX : false;
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
      isLock,
      doLock,
    };
  },
};
</script>

<style scoped lang="less">
.lock-active {
  color: #2d8cf0;
}
</style>
