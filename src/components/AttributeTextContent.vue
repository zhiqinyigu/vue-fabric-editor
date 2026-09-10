<script>
import {
  reactive,
  ref,
  getCurrentInstance,
  onMounted,
  onBeforeUnmount,
} from '@vue/composition-api';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';
import PathEditorDialog from './PathEditorDialog.vue';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';

export default {
  name: 'AttrBute',
  components: {
    InputNumber,
    PathEditorDialog,
    AttrSection,
    AttrField,
    AttrMultiField,
  },
  setup() {
    const update = getCurrentInstance();
    const { fabric, canvasEditor, isOne, isMatchType } = useSelect(['i-text', 'textbox']);
    const showPathEditor = ref(false);
    const baseAttr = reactive({
      text: '',
      strokeWidth: 1,
      stroke: '',
      showPathAttr: false,
      d: '',
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
          baseAttr.d = fabric.util.joinPath(path.path);
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
          // 文本变化会重算尺寸，触发属性面板（尺寸/位置）刷新
          canvasEditor.emit('selectOne', [activeObject]);
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

    // 应用新的路径数据（替换当前路径文字所挂路径），并保持文本位置、让文本从路径起点开始
    const applyPath = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      const d = (baseAttr.d || '').trim();
      if (!activeObject || !activeObject.path || !d) return;
      try {
        const parsed = fabric.util.parsePath(d);
        const path = activeObject.path;
        // 记录文本当前位置：替换后平移路径数据，使新路径起点落在文本当前起点
        const curLeft = activeObject.left;
        const curTop = activeObject.top;
        path._setPath(parsed);
        const dx = curLeft - path.left;
        const dy = curTop - path.top;
        if (dx || dy) {
          const shifted = path.path.map((seg) =>
            seg.map((v, idx) =>
              idx === 0 ? v : typeof v === 'number' ? v + (idx % 2 === 1 ? dx : dy) : v
            )
          );
          path._setPath(shifted);
        }
        // 文本位置与路径坐标对齐（保持原位），文本从路径起点开始
        activeObject.setPathInfo(); // 重算 segmentsInfo，文本沿路径排布
        activeObject.set({ left: path.left, top: path.top });
        activeObject.initDimensions();
        activeObject.setCoords();
        canvasEditor.canvas.renderAll();
        baseAttr.d = fabric.util.joinPath(path.path);
      } catch (err) {
        update &&
          update.proxy &&
          update.proxy.$Message &&
          update.proxy.$Message.error('路径数据格式不正确');
      }
    };

    // 打开 SVG 路径编辑器绘制，应用时回填 d 并应用
    const openPathEditor = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (!activeObject || !activeObject.path) return;
      showPathEditor.value = true;
    };
    const onApplyFromEditor = (d) => {
      baseAttr.d = d;
      applyPath();
      showPathEditor.value = false;
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
      showPathEditor,
      openPathEditor,
      onApplyFromEditor,
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

      <!-- 编辑路径：只读 d + 编辑按钮（打开路径编辑器） -->
      <AttrField editable style="margin-top: 8px">
        <Input :value="baseAttr.d" readonly placeholder="路径 d" @keydown.stop />
        <template #right>
          <Button size="small" type="primary" @click="openPathEditor">编辑</Button>
        </template>

        <PathEditorDialog
          v-model="showPathEditor"
          :initial-path="baseAttr.d"
          @apply="onApplyFromEditor"
        />
      </AttrField>
    </template>

    <PathEditorDialog
      v-model="showPathEditor"
      :initial-path="baseAttr.d"
      @apply="onApplyFromEditor"
    />
  </AttrSection>
</template>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';
</style>
