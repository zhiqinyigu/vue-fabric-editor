<!--
 * @Author: 秦少卫
 * @Date: 2024-06-06 20:04:48
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:34:37
 * @Description: 二维码组件
-->

<template>
  <AttrSection v-if="isOne && isMatchType && isQrcode" title="二位码属性">
    <div>
      <AttrField label="内容">
        <Input v-model="baseAttr.data" @on-change="changeCommon" />
      </AttrField>

      <AttrMultiField>
        <AttrField bare>
          <InputNumber
            v-model="baseAttr.width"
            append="宽度"
            :min="1"
            @on-change="changeCommon"
          ></InputNumber>
        </AttrField>
        <AttrField bare>
          <InputNumber
            v-model="baseAttr.margin"
            append="边距"
            :min="1"
            @on-change="changeCommon"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>

      <AttrMultiField>
        <AttrField bare label="散点">
          <ColorPicker v-model="baseAttr.dotsColor" alpha @on-change="changeCommon" />
        </AttrField>
        <AttrField bare>
          <template #label>
            <span style="margin-left: 10px">类型</span>
          </template>
          <Select v-model="baseAttr.dotsType" style="width: 90px" @on-change="changeCommon">
            <Option v-for="item in optionsList.DotsType" :key="item" :value="item">
              {{ item }}
            </Option>
          </Select>
        </AttrField>
      </AttrMultiField>

      <AttrMultiField>
        <AttrField bare label="外角">
          <ColorPicker v-model="baseAttr.cornersSquareColor" alpha @on-change="changeCommon" />
        </AttrField>
        <AttrField bare>
          <template #label>
            <span style="margin-left: 10px">类型</span>
          </template>
          <Select
            v-model="baseAttr.cornersSquareType"
            style="width: 90px"
            @on-change="changeCommon"
          >
            <Option v-for="item in optionsList.cornersDotType" :key="item" :value="item">
              {{ item }}
            </Option>
          </Select>
        </AttrField>
      </AttrMultiField>
      <AttrMultiField>
        <AttrField bare label="内角">
          <ColorPicker v-model="baseAttr.cornersDotColor" alpha @on-change="changeCommon" />
        </AttrField>
        <AttrField bare>
          <template #label>
            <span style="margin-left: 10px">类型</span>
          </template>
          <Select v-model="baseAttr.cornersDotType" style="width: 90px" @on-change="changeCommon">
            <Option v-for="item in optionsList.cornersDotType" :key="item" :value="item">
              {{ item }}
            </Option>
          </Select>
        </AttrField>
      </AttrMultiField>

      <AttrMultiField>
        <AttrField bare label="背景">
          <ColorPicker v-model="baseAttr.background" alpha @on-change="changeCommon" />
        </AttrField>
        <AttrField bare>
          <template #label>
            <span style="margin-left: 10px">容错</span>
          </template>
          <Select
            v-model="baseAttr.errorCorrectionLevel"
            style="width: 90px"
            @on-change="changeCommon"
          >
            <Option v-for="item in optionsList.errorCorrectionLevelType" :key="item" :value="item">
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

export default {
  name: 'AttrBute',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrMultiField,
  },
  setup() {
    const update = getCurrentInstance();
    const { canvasEditor, isOne, isMatchType } = useSelect(['image']);

    // 文字元素
    const extensionType = ref('');

    const isQrcode = computed(() => extensionType.value === 'qrcode');

    // 属性值
    const baseAttr = reactive({
      data: '',
      width: 300,
      margin: 10,
      errorCorrectionLevel: 'M',
      dotsColor: 'red',
      dotsType: 'rounded',
      cornersSquareColor: 'black',
      cornersSquareType: 'dot',
      cornersDotColor: 'black',
      cornersDotType: 'square',
      background: '#ffffff',
    });

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      extensionType.value = activeObject?.extensionType || '';
      if (activeObject && isMatchType && activeObject?.extensionType === 'qrcode') {
        const extension = activeObject.get('extension');
        Object.keys(extension).forEach((key) => {
          baseAttr[key] = extension[key];
        });
      }
    };

    // 通用属性改变
    const changeCommon = () => {
      canvasEditor.setQrCode(toRaw(baseAttr));
      canvasEditor.canvas.renderAll();
    };

    const selectCancel = () => {
      extensionType.value = '';
      update && update.proxy && update.proxy.$forceUpdate();
    };

    // 容错率

    const res = canvasEditor.getQrCodeTypes();
    const optionsList = reactive(res);

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
      isQrcode,
      baseAttr,
      changeCommon,
      optionsList,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
