<script>
import {
  reactive,
  ref,
  computed,
  getCurrentInstance,
  onMounted,
  onBeforeUnmount,
} from '@vue/composition-api';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';
import PathEditorDialog from './PathEditorDialog.vue';
import { refreshPathTextDims } from '@/core/objects/CustomIText';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';
import ColorPalettePicker from '@/components/ColorPalettePicker.vue';

export default {
  name: 'AttrBute',
  components: {
    InputNumber,
    PathEditorDialog,
    AttrSection,
    AttrField,
    AttrMultiField,
    ColorPalettePicker,
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
      legacyPathDims: true,
    });
    // 当前文本是否含模板变量占位符，用于高亮提示
    const hasVariable = computed(() =>
      canvasEditor.containsVariable ? canvasEditor.containsVariable(baseAttr.text) : false
    );
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
          baseAttr.legacyPathDims = activeObject.legacyPathDims !== false;
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
          // 文本变化会重算尺寸；复用 text:changed 契约（画布编辑路径同样派发），
          // 让尺寸/位置面板与 AutoGrowPlugin 同步（否则 .set('text') 不触发增高）。
          canvasEditor.canvas.fire('text:changed', { target: activeObject });
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
        // 文本位置与路径坐标对齐（保持原位），文本从路径起点开始：
        // 把路径包围盒左上角锚定到 (path.left, path.top)。
        // legacy 语义下对象 top-left 即路径左上角；5.5 语义下对象含 1.1 倍行高增量，
        // 需按对象中心换算（origin left/top 时 left = path.left - 增量/2）
        activeObject.setPathInfo(); // 重算 segmentsInfo，文本沿路径排布
        activeObject.initDimensions();
        if (activeObject.legacyPathDims === false) {
          const cx = path.left + path.width / 2;
          const cy = path.top + path.height / 2;
          const left =
            activeObject.originX === 'center'
              ? cx
              : activeObject.originX === 'right'
              ? cx + activeObject.width / 2
              : cx - activeObject.width / 2;
          const top =
            activeObject.originY === 'center'
              ? cy
              : activeObject.originY === 'bottom'
              ? cy + activeObject.height / 2
              : cy - activeObject.height / 2;
          activeObject.set({ left, top });
        } else {
          activeObject.set({ left: path.left, top: path.top });
        }
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

    // 路径文字尺寸语义开关：true=兼容旧版（5.3），false=新版（5.5 原生）。
    // 切换时重算尺寸并保持路径渲染位置（对象中心）不变
    const changeLegacyPathDims = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (!activeObject || !activeObject.path) return;
      const legacy = !!value;
      if ((activeObject.legacyPathDims !== false) === legacy) return;
      activeObject.legacyPathDims = legacy;
      refreshPathTextDims(activeObject);
      canvasEditor.canvas.renderAll();
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
      hasVariable,
      changeCommon,
      showPathEditor,
      openPathEditor,
      onApplyFromEditor,
      changeLegacyPathDims,
    };
  },
};
</script>

<template>
  <AttrSection v-if="isOne && isMatchType" :title="$t('text_content')">
    <AttrField editable>
      <Input v-model="baseAttr.text" @on-change="changeCommon('text', baseAttr.text)"></Input>
    </AttrField>

    <div v-if="hasVariable" class="variable-tip" style="margin-top: 10px">
      <Icon type="ios-pricetags" size="13" />
      {{ $t('variable.text_has_variable') }}
    </div>

    <template v-if="baseAttr.showPathAttr">
      <Divider plain orientation="left"><h4>文本路径</h4></Divider>
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
      </div>

      <!-- 编辑路径：只读 d + 编辑按钮（打开路径编辑器） -->
      <AttrField editable style="margin-top: 8px">
        <Input :value="baseAttr.d" readonly placeholder="路径 d" @keydown.stop />
        <template #right>
          <Button size="small" type="primary" @click="openPathEditor">编辑</Button>
        </template>
      </AttrField>

      <!-- 尺寸语义开关：默认兼容旧版模板；粘贴自其他新版编辑器的路径文字偏移时可关闭 -->
      <AttrField split bare style="margin-top: 8px">
        <template #label>
          <span>{{ $t('textPath.legacyDims') }}</span>
          <Tooltip placement="top" :content="$t('textPath.legacyDimsTip')">
            <Icon type="ios-help-circle-outline" size="18" />
          </Tooltip>
        </template>
        <iSwitch
          v-model="baseAttr.legacyPathDims"
          size="small"
          @on-change="changeLegacyPathDims"
        ></iSwitch>
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

.variable-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: -4px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #2d8cf0;
  background: #e8f3ff;
  border-radius: 4px;
  padding: 4px 8px;
}
</style>
