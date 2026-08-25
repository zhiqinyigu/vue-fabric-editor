<!--
 * @Author: 秦少卫
 * @Date: 2024-06-10 17:52:40
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-13 17:08:59
 * @Description: 小数点下标上标
-->

<template>
  <div v-if="isOne && isMatchType" class="attr-item-box">
    <AttrField :label="$t('textFloat')">
      <Select
        v-model="baseAttr.verticalAlign"
        @on-change="(value) => changeCommon('verticalAlign', value)"
      >
        <Option value="null">无</Option>
        <Option value="bottom">下标</Option>
        <Option value="top">上标</Option>
      </Select>
    </AttrField>
  </div>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import AttrField from '@/components/attrPanel/AttrField.vue';

export default {
  name: 'Price',
  components: {
    AttrField,
  },
  setup() {
    const baseAttr = reactive({
      verticalAlign: 'null',
    });

    const matchType = ['i-text', 'textbox', 'text'];
    const { isMatchType, canvasEditor, isOne } = useSelect(matchType);

    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject && isMatchType && activeObject?.text?.includes('.')) {
        baseAttr.verticalAlign = activeObject.get('verticalAlign');
      }
    };

    const changeCommon = (key, value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject && activeObject.text.includes('.')) {
        const [init] = activeObject.text.split('.');
        const startIndex = init.length + 1;
        const endIndex = activeObject.text.length;
        activeObject.styles = [];
        // 上标
        if (value === 'top') {
          activeObject.setSuperscript(startIndex, endIndex);
        } else if (value === 'bottom') {
          // 下标
          activeObject.setSelectionStyles(
            {
              fontSize: activeObject.superscript.size * activeObject.fontSize,
            },
            startIndex,
            endIndex
          );
        }
        activeObject.set(key, value);
        canvasEditor.canvas.renderAll();
      }
    };

    const update = getCurrentInstance();
    const selectCancel = () => {
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
      // 获取字体数据
      getObjectAttr();
      canvasEditor.on('selectCancel', selectCancel);
      canvasEditor.on('selectOne', getObjectAttr);
      canvasEditor.canvas.on('object:modified', getObjectAttr);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectCancel', selectCancel);
      canvasEditor.off('selectOne', getObjectAttr);
      canvasEditor.canvas.off('object:modified', getObjectAttr);
    });

    return {
      isOne,
      isMatchType,
      baseAttr,
      changeCommon,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
