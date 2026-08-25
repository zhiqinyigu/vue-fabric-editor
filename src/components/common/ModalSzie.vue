<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-11 19:09:45
 * @Description: 公共尺寸
-->

<template>
  <Modal v-model="modal" :title="props.title" footer-hide>
    <h3>
      {{ $t('importFiles.createDesign.customSize') }}
    </h3>
    <Form ref="formInline" inline :label-width="40">
      <FormItem label="宽度">
        <InputNumber v-model="width" :min="1" placeholder="请输入"></InputNumber>
      </FormItem>
      <FormItem label="高度">
        <InputNumber v-model="height" :min="1" placeholder="请输入"></InputNumber>
      </FormItem>
      <FormItem :label-width="0">
        <Button type="primary" @click="customSizeCreate">
          {{ $t('importFiles.createDesign.create') }}
        </Button>
      </FormItem>
    </Form>
    <Divider class="divider" />
    <h3>
      {{ $t('importFiles.createDesign.systemSize') }}
    </h3>
    <CellGroup @on-click="setSize">
      <Cell
        v-for="item in sizeList"
        :key="item.name"
        :title="item.name"
        :label="`${item.width}x${item.height}${item.unit}`"
        :arrow="false"
        :name="`${item.width}x${item.height}x${item.unit}`"
      >
        <template #extra>
          <Icon type="md-add" />
        </template>
      </Cell>
    </CellGroup>
  </Modal>
</template>

<script>
import { ref } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import { Message } from 'view-design';

export default {
  name: 'ImportJson',
  props: {
    title: {
      type: String,
      default: '',
    },
  },
  setup(props, { emit }) {
    const { canvasEditor } = useSelect();

    const modal = ref(false);
    const width = ref(null);
    const height = ref(null);
    const sizeList = ref([]);
    const showSetSize = (w, h) => {
      width.value = w || null;
      height.value = h || null;
      // 获取素材
      canvasEditor.getSizeList().then((res) => {
        sizeList.value = res;
      });
      modal.value = true;
    };
    const setSize = (itemString) => {
      const [w, h] = itemString.split('x');
      width.value = Number(w);
      height.value = Number(h);
    };

    const customSizeCreate = async () => {
      if (width.value && height.value) {
        emit('set', width.value, height.value);
        modal.value = false;
      } else {
        Message.warning('请检查尺寸');
      }
    };

    return {
      props,
      modal,
      width,
      height,
      sizeList,
      setSize,
      customSizeCreate,
      showSetSize,
    };
  },
};
</script>
<style scoped lang="less">
h3 {
  margin-bottom: 10px;
}
.divider {
  margin-top: 0;
}
</style>
