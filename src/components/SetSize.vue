<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: June
 * @LastEditTime: 2024-11-22 15:28:43
 * @Description: 尺寸设置
-->

<template>
  <AttrSection v-if="!isSelect" :title="$t('bgSeting.size')">
    <Form :label-width="40" inline class="form-wrap">
      <FormItem :label="$t('bgSeting.width')" prop="name">
        <InputNumber v-model="width" disabled readonly @on-change="setSize"></InputNumber>
      </FormItem>
      <FormItem :label="$t('bgSeting.height')" prop="name">
        <InputNumber v-model="height" disabled readonly @on-change="setSize"></InputNumber>
      </FormItem>
      <FormItem :label-width="0">
        <Button type="text" @click="showSetSize">
          <Icon type="md-create" />
        </Button>
      </FormItem>
    </Form>

    <!-- 修改尺寸 -->
    <ModalSzie ref="modalSizeRef" :title="$t('setSizeTip')" @set="handleConfirm"></ModalSzie>
  </AttrSection>
</template>

<script>
import { ref, onMounted } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import ModalSzie from '@/components/common/ModalSzie';
import AttrSection from '@/components/attrPanel/AttrSection.vue';

export default {
  name: 'CanvasSize',
  components: { ModalSzie, AttrSection },
  setup() {
    const { isSelect, canvasEditor } = useSelect();

    const modalSizeRef = ref(null);

    const width = ref(0);
    const height = ref(0);

    onMounted(() => {
      const size = canvasEditor.getWorkspase();
      const { width: w, height: h } = size || {};
      width.value = w;
      height.value = h;
      canvasEditor.on('sizeChange', (w, h) => {
        width.value = w;
        height.value = h;
      });
    });

    const setSize = () => {
      canvasEditor.setSize(width.value, height.value);
    };

    const showSetSize = () => {
      modalSizeRef.value.showSetSize(width.value, height.value);
    };
    const handleConfirm = (w, h) => {
      width.value = w;
      height.value = h;
      setSize();
    };

    return {
      isSelect,
      modalSizeRef,
      width,
      height,
      setSize,
      showSetSize,
      handleConfirm,
    };
  },
};
</script>

<style scoped lang="less">
/deep/ .ivu-form-item {
  margin-bottom: 0;
}

/deep/ .ivu-input-number {
  width: 70px;
}
.form-wrap {
  display: flex;
}
</style>
