<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 09:23:36
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:33:41
 * @Description: file content
-->

<template>
  <AttrSection v-if="isOne" :title="$t('positionInfo')">
    <div v-show="isMatchType">
      <AttrMultiField :gutter="10" no-background>
        <AttrField>
          <InputNumber
            v-model="baseAttr.left"
            :append="$t('attributes.left')"
            @on-change="(value) => changeCommon('left', value)"
          ></InputNumber>
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.top"
            :append="$t('attributes.top')"
            @on-change="(value) => changeCommon('top', value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>
    </div>
  </AttrSection>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';

export default {
  name: 'AttrPosition',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrMultiField,
  },
  setup() {
    const update = getCurrentInstance();

    // 可修改的元素
    const baseType = [
      'text',
      'i-text',
      'textbox',
      'rect',
      'circle',
      'triangle',
      'polygon',
      'image',
      'group',
      'line',
      'arrow',
      'thinTailArrow',
    ];
    const { isMatchType, canvasEditor, isOne } = useSelect(baseType);

    // 属性值
    const baseAttr = reactive({
      left: 0,
      top: 0,
    });

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject && isMatchType) {
        baseAttr.left = activeObject.get('left');
        baseAttr.top = activeObject.get('top');
      }
    };

    // 通用属性改变
    const changeCommon = (key, value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set(key, value);
        canvasEditor.canvas.renderAll();
      }
    };

    const selectCancel = () => {
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
      getObjectAttr();
      canvasEditor.on('selectCancel', selectCancel);
      canvasEditor.on('selectOne', getObjectAttr);
      canvasEditor.canvas.on('object:modified', getObjectAttr);
      // 拖拽/移动/旋转过程中实时刷新位置
      canvasEditor.canvas.on('object:moving', getObjectAttr);
      canvasEditor.canvas.on('object:rotating', getObjectAttr);
      canvasEditor.canvas.on('object:resizing', getObjectAttr);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectCancel', selectCancel);
      canvasEditor.off('selectOne', getObjectAttr);
      canvasEditor.canvas.off('object:modified', getObjectAttr);
      canvasEditor.canvas.off('object:moving', getObjectAttr);
      canvasEditor.canvas.off('object:rotating', getObjectAttr);
      canvasEditor.canvas.off('object:resizing', getObjectAttr);
    });

    return {
      isMatchType,
      canvasEditor,
      isOne,
      baseAttr,
      changeCommon,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';

.ivu-row {
  margin-bottom: 10px;
}
</style>
