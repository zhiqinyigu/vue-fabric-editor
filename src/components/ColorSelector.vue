<!--
 * @Author: 秦少卫
 * @Date: 2023-02-16 22:52:00
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-05-21 15:15:04
 * @Description: 颜色选择器
-->
<template>
  <div class="box">
    <ColorPicker
      :value="value"
      :modes="['渐变', '纯色']"
      @update:value="(val) => (value = val)"
      @change="onChange"
    ></ColorPicker>
  </div>
</template>

<script>
import { ref, watch, onMounted } from '@vue/composition-api';
import { fabric } from 'fabric';
import useSelect from '@/hooks/select';
import ColorPicker from './color-picker';

export default {
  name: 'ColorSelector',
  components: {
    ColorPicker,
  },
  props: {
    angleKey: {
      type: String,
      default: 'gradientAngle',
    },
    color: {
      type: [Object, String],
      default: '',
    },
  },
  setup(props, { emit }) {
    const { canvasEditor } = useSelect();
    // 颜色picker展示值（纯色hex 或 渐变css）
    const value = ref('');

    // Fabric渐变转css
    const fabricGradientToCss = (val, activeObject) => {
      // 渐变类型
      if (!val) return '';
      const angle = activeObject
        ? activeObject.get(props.angleKey, val.degree) || val.degree
        : val.degree || 0;
      const colorStops = val.colorStops.map((item) => `${item.color} ${item.offset * 100}%`);
      return `linear-gradient(${angle}deg, ${colorStops.join(', ')})`;
    };
    // 回显颜色
    const checkColor = (val) => {
      if (typeof val === 'string') {
        value.value = val;
      } else {
        // 渐变
        const activeObject = canvasEditor.canvas.getActiveObjects()[0];
        value.value = fabricGradientToCss(val, activeObject);
      }
    };
    // css转Fabric渐变
    const cssToFabricGradient = (val, activeObject, angle) => {
      // 角度转换坐标
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
        coords: {
          x1: angleCoords.x1 * activeObject.width,
          y1: angleCoords.y1 * activeObject.height,
          x2: angleCoords.x2 * activeObject.width,
          y2: angleCoords.y2 * activeObject.height,
        },
        colorStops: [...val],
      });
    };
    // 颜色改变
    const onChange = (info) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (info.mode === '纯色') {
        emit('change', info.color);
      } else if (info.mode === '渐变') {
        const currentGradient = cssToFabricGradient(info.stops, activeObject, info.angle);
        // 保存角度，用于下一次选中展示
        activeObject && activeObject.set(props.angleKey, info.angle);
        emit('change', currentGradient);
      }
    };
    watch(
      () => props.color,
      (val) => {
        checkColor(val);
      }
    );
    onMounted(() => {
      checkColor(props.color);
    });

    return {
      value,
      onChange,
    };
  },
};
</script>

<style scoped lang="less">
.box {
  padding: 10px 0;
}

// 渐变条
.gradient-bar {
  width: 100%;
  height: 30px;
  cursor: pointer;
  border-radius: 5px;
}

.switch {
  margin-bottom: 10px;
}

// 提示弹框
/deep/ .ivu-color-picker {
  display: block;
}

/deep/ .ivu-poptip-body {
  padding: 5px;
}

/deep/ .ivu-poptip {
  width: 100%;

  .ivu-poptip-rel {
    width: 100%;
  }
}

// 渐变选择器
/deep/ .ui-color-picker {
  .picker-area,
  .gradient-controls,
  .color-preview-area {
    padding: 0;
  }
  border-radius: 10px;
  padding: 8px;
  margin: 0;
  margin-top: 10px;
  width: 100%;
}
</style>
