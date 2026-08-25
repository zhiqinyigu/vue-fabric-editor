<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 10:10:24
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:18:47
 * @Description: 阴影
-->

<template>
  <AttrSection v-if="isOne" title="阴影">
    <!-- 通用属性 -->
    <div>
      <AttrMultiField :gutter="10" no-background>
        <AttrField :label="$t('color')">
          <ColorPalettePicker
            :value.sync="baseAttr.shadow.color"
            :show-input="false"
            :color-modes="['monochrome']"
            format="RGB"
            @change="changeCommon"
          />
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.shadow.blur"
            :defaultValue="0"
            :append="$t('attributes.blur')"
            :min="0"
            @on-change="changeCommon"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>
      <AttrMultiField :gutter="10" no-background>
        <AttrField>
          <InputNumber
            v-model="baseAttr.shadow.offsetX"
            :defaultValue="0"
            :append="$t('attributes.offset_x')"
            @on-change="changeCommon"
          ></InputNumber>
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.shadow.offsetY"
            :defaultValue="0"
            :append="$t('attributes.offset_y')"
            @on-change="changeCommon"
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
import ColorPalettePicker from '@/components/ColorPalettePicker.vue';

export default {
  name: 'AttrBute',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrMultiField,
    ColorPalettePicker,
  },
  setup() {
    const update = getCurrentInstance();
    const { fabric, isOne, canvasEditor } = useSelect();

    // 属性值
    const baseAttr = reactive({
      shadow: {},
    });

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject) {
        baseAttr.shadow = activeObject.get('shadow') || {};
      }
    };

    // 通用属性改变
    const changeCommon = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set('shadow', new fabric.Shadow(baseAttr.shadow));
        canvasEditor.canvas.renderAll();
      }
    };

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
      baseAttr,
      changeCommon,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
