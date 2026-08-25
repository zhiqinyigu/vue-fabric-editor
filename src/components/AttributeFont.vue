<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 10:35:12
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:32:41
 * @Description: 字体属性
-->

<template>
  <AttrSection v-if="isOne && isMatchType" title="字体属性">
    <div>
      <AttrMultiField :gutter="12" no-background>
        <AttrField>
          <div class="font-selector">
            <Select v-model="baseAttr.fontFamily" @on-change="changeFontFamily">
              <Option v-for="item in fontsList" :key="`font-${item.name}`" :value="item.name">
                <div class="font-item" :style="`background-image:url('${item.img}');`">
                  {{ !item.img ? item : '' }}
                  <!-- 解决无法选中问题 -->
                  <span style="display: none">{{ item.name }}</span>
                </div>
              </Option>
            </Select>
          </div>
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.fontSize"
            append="字号"
            :min="1"
            @on-change="(value) => changeCommon('fontSize', value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>

      <AttrField>
        <RadioGroup
          v-model="baseAttr.textAlign"
          class="button-group"
          type="button"
          @on-change="(value) => changeCommon('textAlign', value)"
        >
          <!-- 自动宽度文本（text/i-text）无固定宽度盒，justify 无生效场景，禁用 -->
          <Radio
            v-for="(item, i) in textAlignList"
            :key="item"
            :label="item"
            :disabled="item === 'justify' && justifyDisabled"
          >
            <span v-html="textAlignListSvg[i]"></span>
          </Radio>
        </RadioGroup>
      </AttrField>

      <AttrField>
        <ButtonGroup class="button-group">
          <Button @click="changeFontWeight('fontWeight', baseAttr.fontWeight)">
            <FontWeight
              :fill="baseAttr.fontWeight === 'bold' ? '#305ef4' : '#666'"
              width="14"
              height="14"
            ></FontWeight>
          </Button>
          <Button @click="changeFontStyle('fontStyle', baseAttr.fontStyle)">
            <FontStyle
              :fill="baseAttr.fontStyle === 'italic' ? '#305ef4' : '#666'"
              width="14"
              height="14"
            ></FontStyle>
          </Button>
          <Button @click="changeLineThrough('linethrough', baseAttr.linethrough)">
            <Linethrough
              :fill="baseAttr.linethrough ? '#305ef4' : '#666'"
              width="14"
              height="14"
            ></Linethrough>
          </Button>
          <Button @click="changeUnderline('underline', baseAttr.underline)">
            <Underline
              :fill="baseAttr.underline ? '#305ef4' : '#666'"
              width="14"
              height="14"
            ></Underline>
          </Button>
        </ButtonGroup>
      </AttrField>

      <AttrMultiField :gutter="12" no-background>
        <AttrField>
          <InputNumber
            v-model="baseAttr.lineHeight"
            :step="0.1"
            :append="$t('attributes.line_height')"
            @on-change="(value) => changeCommon('lineHeight', value)"
          ></InputNumber>
        </AttrField>
        <AttrField>
          <InputNumber
            v-model="baseAttr.charSpacing"
            :append="$t('attributes.char_spacing')"
            @on-change="(value) => changeCommon('charSpacing', value)"
          ></InputNumber>
        </AttrField>
      </AttrMultiField>

      <AttrField :label="$t('background')">
        <ColorPalettePicker
          :value.sync="baseAttr.textBackgroundColor"
          :color-modes="['monochrome']"
          format="RGB"
          @change="(value) => changeCommon('textBackgroundColor', value)"
        />
      </AttrField>
    </div>
  </AttrSection>
</template>

<script>
import {
  reactive,
  ref,
  getCurrentInstance,
  onMounted,
  onBeforeUnmount,
} from '@vue/composition-api';
import useSelect from '@/hooks/select';
import { Spin } from 'view-design';
import InputNumber from '@/components/inputNumber';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrMultiField from '@/components/attrPanel/AttrMultiField.vue';
import ColorPalettePicker from '@/components/ColorPalettePicker.vue';
import FontWeight from '@/assets/icon/attribute/fontWeight.svg';
import FontStyle from '@/assets/icon/attribute/fontStyle.svg';
import Linethrough from '@/assets/icon/attribute/linethrough.svg';
import Underline from '@/assets/icon/attribute/underline.svg';

import textAlignLeft from '!!raw-loader!@/assets/icon/attribute/textAlignLeft.svg';
import textAlignRight from '!!raw-loader!@/assets/icon/attribute/textAlignRight.svg';
import textAlignCenter from '!!raw-loader!@/assets/icon/attribute/textAlignCenter.svg';
import textAlignJustitfy from '!!raw-loader!@/assets/icon/attribute/textAlignJustitfy.svg';

export default {
  name: 'AttrBute',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrMultiField,
    ColorPalettePicker,
    FontWeight,
    FontStyle,
    Linethrough,
    Underline,
  },
  setup() {
    const update = getCurrentInstance();

    // 文字元素
    const textType = ['i-text', 'textbox', 'text'];
    const { canvasEditor, isMatchType, isOne } = useSelect(textType);

    // 自动宽度文本（text/i-text）的对齐按钮走 originX 锚点：
    // 这类对象盒宽恒等于行宽，textAlign 无定位效果（fabric _getLineLeftOffset 恒为 0），
    // "中点/右缘贴 x"的真实语义在 originX 上（旧版海报转换数据即此形态）。
    // 挂 path 的路径文字除外：其定位基准是路径坐标，改锚点会牵动路径对齐语义。
    const isAutoWidthText = (obj) =>
      obj && !obj.path && (obj.type === 'i-text' || obj.type === 'text');

    // 属性值
    const baseAttr = reactive({
      fontSize: 0,
      fontFamily: '',
      lineHeight: 0,
      charSpacing: 0,
      fontWeight: '',
      textBackgroundColor: '#fff',
      textAlign: '',
      fontStyle: '',
      underline: false,
      linethrough: false,
      overline: false,
    });

    const fontsList = ref([]);
    canvasEditor.getFontList().then((list) => {
      fontsList.value = list;
    });

    // justify 按钮是否禁用（随选中对象联动）：自动宽度文本（text/i-text）禁用，
    // 固定宽度盒（textbox）与路径文字保持可用
    const justifyDisabled = ref(false);

    // 字体对齐方式
    const textAlignList = ['left', 'center', 'right', 'justify'];
    // 对齐图标
    const textAlignListSvg = [textAlignLeft, textAlignCenter, textAlignRight, textAlignJustitfy];

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject && isMatchType) {
        baseAttr.fontSize = activeObject.get('fontSize');
        baseAttr.fontFamily = activeObject.get('fontFamily');
        baseAttr.lineHeight = activeObject.get('lineHeight');
        // 自动宽度文本显示 originX 锚点（按钮高亮=真实锚点语义）；
        // textbox 等固定宽度盒仍显示 textAlign（盒内对齐）
        baseAttr.textAlign = isAutoWidthText(activeObject)
          ? activeObject.get('originX') || 'left'
          : activeObject.get('textAlign');
        justifyDisabled.value = isAutoWidthText(activeObject);
        baseAttr.underline = activeObject.get('underline');
        baseAttr.linethrough = activeObject.get('linethrough');
        baseAttr.charSpacing = activeObject.get('charSpacing');
        baseAttr.overline = activeObject.get('overline');
        baseAttr.fontStyle = activeObject.get('fontStyle');
        baseAttr.textBackgroundColor = activeObject.get('textBackgroundColor');
        baseAttr.fontWeight = activeObject.get('fontWeight');
      }
    };

    // 通用属性改变
    const changeCommon = (key, value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        if (key === 'textAlign' && isAutoWidthText(activeObject)) {
          // 锚点语义：left/center/right 写 originX（与旧版海报"x 是参照边"心智一致），
          // 并同步 textAlign 供显式 \n 多行的块内对齐（块内居中+行居中叠加=完整居中段落语义）
          // justify 已对自动宽度文本禁用（无生效场景），此分支仅作守卫：
          // 防止该值经其他链路写入非法 originX（fabric 只认 left/center/right）
          if (value === 'justify') {
            activeObject.set('textAlign', value);
          } else {
            // 消除 X 漂移：originX 翻转会改写 (left, top) 的锚点语义，只改锚点会让对象整体横向跳动
            //（left→center 左移半个宽、left→right 左移整个宽）。
            // 渲染形状由（中心点、角度、尺寸）唯一决定，故先记下盒中心（画布/父级坐标），
            // 改完锚点后按中心复位：视觉位置完全不变（旋转时中心复位会同时抵消 Y 方向位移），
            // 变化的只有锚点语义与多行的块内对齐
            const center = activeObject.getCenterPoint();
            activeObject.set({ originX: value, textAlign: value });
            activeObject.setPositionByOrigin(center, 'center', 'center');
            activeObject.setCoords && activeObject.setCoords();
            // left 被补偿改写，同步刷新属性面板（X 坐标）与历史记录
            canvasEditor.canvas.fire('object:modified', { target: activeObject });
          }
          canvasEditor.canvas.renderAll();
          return;
        }
        activeObject && activeObject.set(key, value);
        canvasEditor.canvas.renderAll();
      }
    };

    const selectCancel = () => {
      update && update.proxy && update.proxy.$forceUpdate();
    };

    const changeFontFamily = async (fontName) => {
      if (!fontName) return;
      Spin.show();
      canvasEditor.loadFont(fontName).finally(() => Spin.hide());
    };
    const changeFontWeight = (key, value) => {
      const nValue = value === 'normal' ? 'bold' : 'normal';
      baseAttr.fontWeight = nValue;
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      activeObject && activeObject.set(key, nValue);
      canvasEditor.canvas.renderAll();
    };

    // 斜体
    const changeFontStyle = (key, value) => {
      const nValue = value === 'normal' ? 'italic' : 'normal';
      baseAttr.fontStyle = nValue;
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      activeObject && activeObject.set(key, nValue);
      canvasEditor.canvas.renderAll();
    };

    // 中划
    const changeLineThrough = (key, value) => {
      const nValue = value === false;
      baseAttr.linethrough = nValue;
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      activeObject && activeObject.set(key, nValue);
      canvasEditor.canvas.renderAll();
    };

    // 下划
    const changeUnderline = (key, value) => {
      const nValue = value === false;
      baseAttr.underline = nValue;
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      activeObject && activeObject.set(key, nValue);
      canvasEditor.canvas.renderAll();
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
      canvasEditor,
      isMatchType,
      isOne,
      baseAttr,
      fontsList,
      textAlignList,
      textAlignListSvg,
      justifyDisabled,
      changeCommon,
      changeFontFamily,
      changeFontWeight,
      changeFontStyle,
      changeLineThrough,
      changeUnderline,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';

.font-selector {
  /deep/ .ivu-select-item {
    padding: 1px 4px;
  }
  /deep/ .ivu-select-dropdown {
    width: max-content;
    min-width: 200px;
  }

  .font-item {
    height: 40px;
    width: 280px;
    background-size: auto 28px;
    background-repeat: no-repeat;
  }
}
</style>
