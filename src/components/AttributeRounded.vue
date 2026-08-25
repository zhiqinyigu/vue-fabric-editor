<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 10:18:57
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:35:31
 * @Description: 圆角
-->
<template>
  <AttrSection v-if="isOne && isMatchType" title="圆角">
    <!-- 通用属性 -->
    <div>
      <AttrMultiField :gutter="10" no-background>
        <AttrField span="18" bare :label="$t('attributes.rx_ry')" :label-width="40">
          <Slider
            v-model="baseAttr.roundValue"
            :max="300"
            @on-input="(value) => changeCommon(value)"
          ></Slider>
        </AttrField>
        <AttrField span="6" bare>
          <InputNumber
            v-model="baseAttr.roundValue"
            :min="0"
            :max="300"
            @on-change="(value) => changeCommon(value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>
    </div>
  </AttrSection>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';

export default {
  name: 'AttrBute',
  components: {
    AttrSection,
    AttrField,
    AttrMultiField,
  },
  setup() {
    const update = getCurrentInstance();
    const { canvasEditor, isOne, isMatchType } = useSelect(['rect']);

    // 属性值
    const baseAttr = reactive({
      roundValue: 0,
    });

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject) {
        baseAttr.roundValue = activeObject.get('roundValue');
      }
    };

    // 通用属性改变
    const changeCommon = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set('ry', value);
        activeObject.set('rx', value);
        activeObject.set('roundValue', value);
        canvasEditor.canvas.renderAll();
      }
    };

    const selectCancel = () => {
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
      // 获取圆角数据
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
