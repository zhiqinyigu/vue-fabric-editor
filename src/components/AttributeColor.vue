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
      <Tooltip class="color-control" placement="top" theme="light">
        <div class="color-bar" :style="{ background: baseAttr.fill }"></div>
        <template #content>
          <ColorPicker
            :value="baseAttr.fill"
            :modes="['渐变', '纯色']"
            @update:value="(val) => (baseAttr.fill = val)"
            @change="colorChange"
            @native-pick="dropColor"
          ></ColorPicker>
        </template>
      </Tooltip>
    </div>
  </AttrSection>
</template>

<script>
import {
  reactive,
  toRaw,
  getCurrentInstance,
  onMounted,
  onBeforeUnmount,
} from '@vue/composition-api';
import useSelect from '@/hooks/select';
import ColorPicker from './color-picker';
import AttrSection from '@/components/attrPanel/AttrSection.vue';

export default {
  name: 'AttrButeColor',
  components: {
    ColorPicker,
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

    const colorChange = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        const color = String(value.color).replace('NaN', '');
        if (value.mode === '纯色') {
          activeObject.set('fill', color);
        } else if (value.mode === '渐变') {
          const currentGradient = cssToFabricGradient(
            toRaw(value.stops),
            activeObject.width,
            activeObject.height,
            value.angle
          );
          activeObject.set('fill', currentGradient, value.angle);
          activeObject.set(angleKey, value.angle);
        }
        canvasEditor.canvas.renderAll();
      }
    };

    const dropColor = (value) => {
      colorChange(value);
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
      colorChange,
      dropColor,
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
