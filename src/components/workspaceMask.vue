<template>
  <div class="mask-wrap">
    <div>开启背景蒙版</div>

    <iSwitch v-model="openMask" size="large" @on-change="onMaskChange">
      <template #open>
        <span>开启</span>
      </template>
      <template #close>
        <span>关闭</span>
      </template>
    </iSwitch>
  </div>
</template>

<script>
import { ref, onMounted } from '@vue/composition-api';
import useSelect from '@/hooks/select';

export default {
  name: 'WorkspaceMask',
  setup() {
    const { canvasEditor } = useSelect();

    const openMask = ref(false);
    const onMaskChange = () => {
      canvasEditor?.workspaceMaskToggle();
    };

    onMounted(() => {
      openMask.value = canvasEditor?.getworkspaceMaskStatus();
    });

    return {
      openMask,
      onMaskChange,
    };
  },
};
</script>

<style lang="less" scoped>
.mask-wrap {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
