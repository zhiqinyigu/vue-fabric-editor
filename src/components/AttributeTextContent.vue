<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
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
    const { canvasEditor, isOne, isMatchType } = useSelect(['i-text']);
    const baseAttr = reactive({
      text: '',
      strokeWidth: 1,
      stroke: '',
      showPathAttr: false,
    });
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject) {
        baseAttr.text = activeObject.get('text');
        const path = activeObject.get('path');
        if (path) {
          baseAttr.strokeWidth = path.strokeWidth;
          baseAttr.stroke = path.stroke;
          baseAttr.showPathAttr = true;
        } else {
          baseAttr.showPathAttr = false;
        }
      }
    };
    const changeCommon = (key, value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        baseAttr[key] = value;
        if (key === 'text') {
          activeObject.set(key, value);
        } else {
          const path = activeObject.get('path');
          path.set(key, value);
        }
        canvasEditor.canvas.renderAll();
      }
    };
    const selectCancel = () => {
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
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

<template>
  <AttrSection v-if="isOne && isMatchType" :title="$t('text_content')">
    <AttrField editable>
      <Input v-model="baseAttr.text" @on-change="changeCommon('text', baseAttr.text)"></Input>
    </AttrField>

    <template v-if="baseAttr.showPathAttr">
      <Divider plain orientation="left"><h4>文本路径</h4></Divider>
      <div>
        <AttrMultiField :gutter="12" no-background>
          <AttrField :label="$t('color')">
            <ColorPicker
              v-model="baseAttr.stroke"
              alpha
              @on-change="(value) => changeCommon('stroke', value)"
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
      </div>
    </template>
  </AttrSection>
</template>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
