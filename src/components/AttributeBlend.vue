<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:02:24
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 16:02:24
 * @Description: 图层模式（混合模式）属性面板
 * 基于 fabric.Object.globalCompositeOperation（canvas 合成模式）
-->

<template>
  <AttrSection v-if="isOne" :title="$t('attributes.blend')">
    <AttrField>
      <Select v-model="baseAttr.blend" @on-change="changeCommon">
        <Option v-for="item in blendModes" :key="item.value" :value="item.value">
          {{ $t(item.label) }}
        </Option>
      </Select>
    </AttrField>
  </AttrSection>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';

const blendModes = [
  { value: 'source-over', label: 'attributes.blendModes.normal' },
  { value: 'multiply', label: 'attributes.blendModes.multiply' },
  { value: 'screen', label: 'attributes.blendModes.screen' },
  { value: 'overlay', label: 'attributes.blendModes.overlay' },
  { value: 'darken', label: 'attributes.blendModes.darken' },
  { value: 'lighten', label: 'attributes.blendModes.lighten' },
  { value: 'color-dodge', label: 'attributes.blendModes.colorDodge' },
  { value: 'color-burn', label: 'attributes.blendModes.colorBurn' },
  { value: 'hard-light', label: 'attributes.blendModes.hardLight' },
  { value: 'soft-light', label: 'attributes.blendModes.softLight' },
  { value: 'difference', label: 'attributes.blendModes.difference' },
  { value: 'exclusion', label: 'attributes.blendModes.exclusion' },
  { value: 'hue', label: 'attributes.blendModes.hue' },
  { value: 'saturation', label: 'attributes.blendModes.saturation' },
  { value: 'color', label: 'attributes.blendModes.color' },
  { value: 'luminosity', label: 'attributes.blendModes.luminosity' },
  { value: 'lighter', label: 'attributes.blendModes.lighter' },
  { value: 'destination-out', label: 'attributes.blendModes.destinationOut' },
  { value: 'destination-in', label: 'attributes.blendModes.destinationIn' },
  { value: 'xor', label: 'attributes.blendModes.xor' },
];

export default {
  name: 'AttrBlend',
  components: {
    AttrSection,
    AttrField,
  },
  setup() {
    const { canvasEditor, isOne } = useSelect();

    const baseAttr = reactive({
      blend: 'source-over',
    });

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject) {
        baseAttr.blend = activeObject.get('globalCompositeOperation') || 'source-over';
      }
    };

    // 通用属性改变
    const changeCommon = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set('globalCompositeOperation', baseAttr.blend);
        canvasEditor.canvas.renderAll();
      }
    };

    const update = getCurrentInstance();
    const selectCancel = () => {
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
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
      blendModes,
      changeCommon,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
