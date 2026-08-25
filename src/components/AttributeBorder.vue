<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 10:18:57
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:31:43
 * @Description: 边框
-->
<template>
  <AttrSection v-if="isOne && !isGroup" title="边框">
    <!-- 通用属性 -->
    <div>
      <AttrMultiField :gutter="12" no-background>
        <AttrField :label="$t('color')">
          <ColorPalettePicker
            :value.sync="baseAttr.stroke"
            :show-input="false"
            :color-modes="['monochrome']"
            format="RGB"
            @change="(value) => changeCommon('stroke', value)"
          />
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.strokeWidth"
            :append="$t('width')"
            :min="0"
            @on-change="(value) => changeCommon('strokeWidth', value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>

      <AttrField :label="$t('attributes.stroke')">
        <Select v-model="baseAttr.strokeDashArray" @on-change="borderSet">
          <Option v-for="item in strokeDashList" :key="`stroke-${item.label}`" :value="item.label">
            {{ item.label }}
          </Option>
        </Select>
      </AttrField>
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
    const { isOne, isGroup, canvasEditor } = useSelect();

    const groupType = ['group'];
    // 属性值
    const baseAttr = reactive({
      stroke: '#fff',
      strokeWidth: 0,
      strokeDashArray: [],
    });

    const strokeDashList = [
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [],
          strokeLineCap: 'butt',
        },
        label: 'Stroke',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [1, 10],
          strokeLineCap: 'butt',
        },
        label: 'Dash-1',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [1, 10],
          strokeLineCap: 'round',
        },
        label: 'Dash-2',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [15, 15],
          strokeLineCap: 'square',
        },
        label: 'Dash-3',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [15, 15],
          strokeLineCap: 'round',
        },
        label: 'Dash-4',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [25, 25],
          strokeLineCap: 'square',
        },
        label: 'Dash-5',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [25, 25],
          strokeLineCap: 'round',
        },
        label: 'Dash-6',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [1, 8, 16, 8, 1, 20],
          strokeLineCap: 'square',
        },
        label: 'Dash-7',
      },
      {
        value: {
          strokeUniform: true,
          strokeDashArray: [1, 8, 16, 8, 1, 20],
          strokeLineCap: 'round',
        },
        label: 'Dash-8',
      },
    ];

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();

      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject && !groupType.includes(activeObject.type)) {
        baseAttr.stroke = activeObject.get('stroke');
        baseAttr.strokeWidth = activeObject.get('strokeWidth');
        const strokeDashArray = JSON.stringify(activeObject.get('strokeDashArray') || []);
        const target = strokeDashList.find((item) => {
          return (
            JSON.stringify(item.value.strokeDashArray) === strokeDashArray &&
            activeObject.get('strokeLineCap') === item.value.strokeLineCap
          );
        });
        if (target) {
          baseAttr.strokeDashArray = target.label;
        }
      }
    };

    // 通用属性改变
    const changeCommon = (key, value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set(key, value);
        activeObject.set('strokeUniform', true);
        canvasEditor.canvas.renderAll();
      }
    };

    // 边框设置
    const borderSet = (key) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        const stroke = strokeDashList.find((item) => item.label === key);
        activeObject.set(stroke.value);
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
      isGroup,
      baseAttr,
      changeCommon,
      borderSet,
      strokeDashList,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
