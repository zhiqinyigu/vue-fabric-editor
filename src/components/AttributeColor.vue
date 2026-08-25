<!--
 * @Author: 秦少卫
 * @Date: 2024-05-21 10:59:48
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:32:19
 * @Description: 渐变
-->

<template>
  <AttrSection v-if="isOne && selectType !== 'image' && selectType !== 'group'" title="颜色">
    <!-- 通用属性 -->
    <div class="bg-item">
      <ColorPalettePicker :value.sync="baseAttr.fill" @change="applyColor" />
    </div>
  </AttrSection>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import { parseGradient } from '@/components/vue-color-palette-vue2';
import ColorPalettePicker from '@/components/ColorPalettePicker.vue';
import AttrSection from '@/components/attrPanel/AttrSection.vue';

export default {
  name: 'AttrButeColor',
  components: {
    ColorPalettePicker,
    AttrSection,
  },
  setup() {
    const update = getCurrentInstance();
    const { fabric, selectType, canvasEditor, isOne } = useSelect();
    const angleKey = 'gradientAngle';
    // 属性值
    const baseAttr = reactive({
      fill: '#ffffffff',
    });

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject && isOne) {
        const fill = activeObject.get('fill');
        if (typeof fill === 'string') {
          baseAttr.fill = fill;
        } else {
          baseAttr.fill = fabricGradientToCss(fill, activeObject);
        }
      }
    };

    // 新 picker 输出 css 字符串（纯色或无渐变/渐变）→ 应用到选中对象
    const applyColor = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (!activeObject) return;
      const gradient = parseGradient(value);
      if (gradient) {
        const stops = gradient.config.stops.map((stop) => ({
          color: stop.color.toRgbString(),
          offset: stop.percentage / 100,
        }));
        const currentGradient = cssToFabricGradient(
          stops,
          activeObject.width,
          activeObject.height,
          gradient.config.angle
        );
        activeObject.set('fill', currentGradient);
        activeObject.set(angleKey, gradient.config.angle);
      } else {
        activeObject.set('fill', String(value).replace('NaN', ''));
      }
      canvasEditor.canvas.renderAll();
    };

    const fabricGradientToCss = (val, activeObject) => {
      // 渐变类型
      if (!val) return;
      const angle = activeObject.get(angleKey, val.degree);
      const colorStops = val.colorStops.map((item) => {
        return item.color + ' ' + item.offset * 100 + '%';
      });
      return `linear-gradient(${angle}deg, ${colorStops})`;
    };
    // css转Fabric渐变
    const cssToFabricGradient = (stops, width, height, angle) => {
      const gradAngleToCoords = (paramsAngle) => {
        const anglePI = -parseInt(paramsAngle, 10) * (Math.PI / 180);
        return {
          x1: Math.round(50 + Math.sin(anglePI) * 50) / 100,
          y1: Math.round(50 + Math.cos(anglePI) * 50) / 100,
          x2: Math.round(50 + Math.sin(anglePI + Math.PI) * 50) / 100,
          y2: Math.round(50 + Math.cos(anglePI + Math.PI) * 50) / 100,
        };
      };

      const angleCoords = gradAngleToCoords(angle);
      return new fabric.Gradient({
        type: 'linear',
        gradientUnits: 'pencentage', // pixels or pencentage 像素 或者 百分比
        coords: {
          x1: angleCoords.x1 * width,
          y1: angleCoords.y1 * height,
          x2: angleCoords.x2 * width,
          y2: angleCoords.y2 * height,
        },
        colorStops: [...stops],
      });
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
      selectType,
      canvasEditor,
      isOne,
      baseAttr,
      applyColor,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';

.color-bar {
  // width: 30px;
  height: 30px;
  cursor: pointer;
  border: 2px solid #f6f7f9;
}
::v-deep .ivu-tooltip {
  display: flex;
}

.color-control {
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAAGUlEQVQYV2M4gwH+YwCGIasIUwhT25BVBADtzYNYrHvv4gAAAABJRU5ErkJggg==);
  background-repeat: repeat;
}
</style>
