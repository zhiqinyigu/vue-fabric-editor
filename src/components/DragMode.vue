<!--
 * @Author: 秦少卫
 * @Date: 2023-04-18 08:06:56
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-04-24 12:07:49
 * @Description: 拖拽模式
-->

<template>
  <div class="box">
    <iSwitch v-model="status" size="large" @on-change="switchMode">
      <template #open>
        <span>Drag</span>
      </template>
    </iSwitch>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';

export default {
  name: 'Drag',
  setup() {
    const status = ref(false);
    const { canvasEditor } = useSelect();

    const switchMode = (val) => {
      if (val) {
        canvasEditor.startDring();
      } else {
        canvasEditor.endDring();
      }
    };

    onMounted(() => {
      canvasEditor.on('startDring', () => (status.value = true));
      canvasEditor.on('endDring', () => (status.value = false));
    });

    onBeforeUnmount(() => {
      canvasEditor.off('startDring');
      canvasEditor.off('endDring');
    });

    return {
      status,
      switchMode,
    };
  },
};
</script>
<style scoped lang="less">
.box {
  position: absolute;
  right: 193px;
  bottom: 14px;
}
</style>
