<template>
  <AttrSection v-if="isOne && isImage" title="图像描边" style="margin-bottom: 20px">
    <AttrGroup>
      <template #head>
        <AttrField split bare>
          <template #label>
            <span>启用图像描边</span>
            <Poptip trigger="hover" content="只支持png透明图像">
              <span><Icon type="ios-alert" color="#f34250" /></span>
            </Poptip>
          </template>
          <iSwitch v-model="openImgStroke" size="small" @on-change="onSwitchChange"></iSwitch>
        </AttrField>
      </template>
      <template v-if="openImgStroke">
        <AttrField split bare label="是否只显示描边">
          <iSwitch v-model="isOnlyStroke" size="small" @on-change="updateStroke"></iSwitch>
        </AttrField>
        <AttrField bare label="描边大小" label-width="5em">
          <Slider v-model="strokeWidth" :max="50" @on-input="onSliderChange"></Slider>
        </AttrField>
        <AttrField split bare label="描边颜色">
          <ColorPicker v-model="strokeColor" placement="left" @on-change="onColorChange" />
        </AttrField>
      </template>
    </AttrGroup>
  </AttrSection>
</template>

<script>
import { ref, unref, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import { Utils } from '@/core/index';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrGroup from '@/components/attrPanel/AttrGroup.vue';

export default {
  name: 'ImgStroke',
  components: {
    AttrSection,
    AttrField,
    AttrGroup,
  },
  setup() {
    const { isOne, canvasEditor } = useSelect();
    const isImage = ref(false);
    const openImgStroke = ref(false);
    const strokeWidth = ref(5);
    const strokeColor = ref('#000');
    const isOnlyStroke = ref(false);
    const getActiveObject = () => {
      const activeObject = canvasEditor.fabricCanvas && canvasEditor.fabricCanvas.getActiveObject();
      if (!activeObject || !Utils.isImage(activeObject)) return;
      return activeObject;
    };

    const setOrigin = () => {
      const _activeObject = getActiveObject();
      if (!_activeObject) return;
      _activeObject.set('originWidth', _activeObject && _activeObject.get('width'));
      _activeObject.set('originHeight', _activeObject && _activeObject.get('height'));
      _activeObject.set('originSrc', _activeObject && _activeObject.getSrc());
    };

    const updateStroke = () => {
      const strokeType = unref(isOnlyStroke) ? 'destination-out' : 'source-over';
      canvasEditor.imageStrokeDraw(unref(strokeColor), unref(strokeWidth), strokeType);
    };

    const closeImgStroke = () => {
      strokeWidth.value = 0;
      updateStroke();
    };

    const onSwitchChange = async (val) => {
      if (val) {
        unref(strokeWidth) === 0 && (strokeWidth.value = 5);
        setOrigin();
        updateStroke();
      } else {
        closeImgStroke();
      }
    };

    const onSliderChange = (val) => {
      strokeWidth.value = val;
      updateStroke();
    };

    const onColorChange = (val) => {
      strokeColor.value = val;
      updateStroke();
    };

    const handleSelectOne = () => {
      isImage.value = !!getActiveObject();
    };

    onMounted(() => {
      canvasEditor.on('selectOne', handleSelectOne);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectOne', handleSelectOne);
    });

    return {
      isOne,
      isImage,
      openImgStroke,
      strokeWidth,
      strokeColor,
      isOnlyStroke,
      onSwitchChange,
      onSliderChange,
      onColorChange,
      updateStroke,
    };
  },
};
</script>

<style lang="less" scoped></style>
