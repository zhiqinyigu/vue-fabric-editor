<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:05:58
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-27 11:05:58
 * @Description: 变量绑定属性面板
-->

<template>
  <AttrSection :title="$t('variable.title')">
    <Button v-if="!previewing" long type="primary" ghost @click="showModal = true">
      <Icon type="ios-settings" size="14" />
      {{ $t('variable.open') }}
    </Button>
    <Button
      v-if="previewing"
      long
      type="warning"
      ghost
      class="exit-preview-btn"
      @click="exitPreview"
    >
      <Icon type="ios-eye-off" size="14" />
      {{ $t('variable.restore') }}
    </Button>
    <div v-if="previewing" class="preview-state">
      <Icon type="ios-eye" size="14" />
      {{ $t('variable.previewing') }}
    </div>
    <VariableConfigModal v-model="showModal" />
  </AttrSection>
</template>

<script>
import { ref } from '@vue/composition-api';
import useTestData from '@/hooks/useTestData';
import VariableConfigModal from '@/components/VariableConfigModal.vue';
import AttrSection from '@/components/attrPanel/AttrSection.vue';

export default {
  name: 'AttributeVariable',
  components: { VariableConfigModal, AttrSection },
  setup() {
    const showModal = ref(false);
    const { previewing, exitPreview } = useTestData();
    return { showModal, previewing, exitPreview };
  },
};
</script>

<style lang="less" scoped>
.exit-preview-btn {
  margin-top: 8px;
}
.preview-state {
  margin-top: 8px;
  color: #ff9900;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
