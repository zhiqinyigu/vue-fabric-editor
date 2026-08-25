<!--
 * @Author: 秦少卫
 * @Date: 2024-06-06 16:27:21
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:30:43
 * @Description: 条形码插件
-->

<template>
  <AttrSection v-if="isOne && isMatchType && isBarcode" title="条形码属性">
    <div>
      <AttrField label="代码">
        <Input v-model="baseAttr.value" @on-change="changeCommon" />
      </AttrField>

      <AttrGroup>
        <template #head>
          <AttrField split bare label="显示">
            <iSwitch v-model="baseAttr.displayValue" size="small" @on-change="changeCommon" />
          </AttrField>
        </template>
        <template v-if="baseAttr.displayValue">
          <AttrField bare label="文字">
            <Input v-model="baseAttr.text" @on-change="changeCommon" />
          </AttrField>
          <AttrField split bare label="水平">
            <RadioGroup
              v-model="baseAttr.textAlign"
              class="button-group"
              type="button"
              @on-change="changeCommon"
            >
              <Radio v-for="(item, i) in textAlignList" :key="item" :label="item">
                <span v-html="textAlignListSvg[i]"></span>
              </Radio>
            </RadioGroup>
          </AttrField>
          <AttrField split bare label="垂直">
            <Select v-model="baseAttr.textPosition" @on-change="changeCommon">
              <Option value="bottom">bottom</Option>
              <Option value="top">top</Option>
            </Select>
          </AttrField>
        </template>
      </AttrGroup>

      <AttrMultiField>
        <AttrField bare label="条码">
          <ColorPalettePicker
            :value.sync="baseAttr.lineColor"
            :show-input="false"
            :color-modes="['monochrome']"
            format="RGB"
            @change="changeCommon"
          />
        </AttrField>
        <AttrField v-if="baseAttr.displayValue" bare>
          <InputNumber
            v-model="baseAttr.fontSize"
            append="字号"
            :min="1"
            @on-change="changeCommon"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>

      <AttrMultiField>
        <AttrField bare label="背景">
          <ColorPalettePicker
            :value.sync="baseAttr.background"
            :show-input="false"
            :color-modes="['monochrome']"
            format="RGB"
            @change="changeCommon"
          />
        </AttrField>
        <AttrField bare>
          <template #label>
            <span style="margin-left: 10px">类型</span>
          </template>
          <Select v-model="baseAttr.format" style="width: 90px" @on-change="changeCommon">
            <Option v-for="item in barcodeTypeList" :key="item" :value="item">
              {{ item }}
            </Option>
          </Select>
        </AttrField>
      </AttrMultiField>
    </div>
  </AttrSection>
</template>

<script>
import {
  reactive,
  ref,
  computed,
  toRaw,
  getCurrentInstance,
  onMounted,
  onBeforeUnmount,
} from '@vue/composition-api';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';
import AttrGroup from '@/components/attrPanel/AttrGroup.vue';
import ColorPalettePicker from '@/components/ColorPalettePicker.vue';

import left from '!!raw-loader!@/assets/icon/barcode/left.svg';
import right from '!!raw-loader!@/assets/icon/barcode/right.svg';
import center from '!!raw-loader!@/assets/icon/barcode/center.svg';

export default {
  name: 'AttrBute',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrMultiField,
    AttrGroup,
    ColorPalettePicker,
  },
  setup() {
    const update = getCurrentInstance();
    const { isOne, canvasEditor, isMatchType } = useSelect(['image']);

    // 文字元素
    const extensionType = ref('');

    const isBarcode = computed(() => extensionType.value === 'barcode');

    // 属性值
    const baseAttr = reactive({
      value: '',
      format: '',
      text: '12121',
      textAlign: 'left',
      textPosition: 'bottom',
      fontSize: 12,
      background: '',
      lineColor: '',
      displayValue: false,
    });

    // 字体对齐方式
    const textAlignList = ['left', 'center', 'right'];
    // 对齐图标
    const textAlignListSvg = [left, center, right];

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      extensionType.value = activeObject?.extensionType || '';
      if (activeObject && isMatchType && activeObject?.extensionType === 'barcode') {
        baseAttr.value = activeObject.get('extension').value;
        baseAttr.format = activeObject.get('extension').format;
        baseAttr.text = activeObject.get('extension').text;
        baseAttr.textAlign = activeObject.get('extension').textAlign;
        baseAttr.textPosition = activeObject.get('extension').textPosition;
        baseAttr.fontSize = activeObject.get('extension').fontSize;
        baseAttr.background = activeObject.get('extension').background;
        baseAttr.lineColor = activeObject.get('extension').lineColor;
        baseAttr.displayValue = activeObject.get('extension').displayValue;
      }
    };

    // 通用属性改变
    const changeCommon = () => {
      canvasEditor.setBarcode(toRaw(baseAttr));
      canvasEditor.canvas.renderAll();
    };

    const selectCancel = () => {
      extensionType.value = '';
      update && update.proxy && update.proxy.$forceUpdate();
    };

    const barcodeTypeList = ref([]);
    barcodeTypeList.value = canvasEditor.getBarcodeTypes();

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
      isMatchType,
      isBarcode,
      baseAttr,
      changeCommon,
      textAlignList,
      textAlignListSvg,
      barcodeTypeList,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
