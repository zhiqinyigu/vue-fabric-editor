<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:29:48
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-14 10:57:53
-->

<template>
  <AttrSection v-if="isOne" :title="$t('sizeSetting.title')">
    <div v-show="isMatchType">
      <!-- 尺寸 -->
      <div class="size-row">
        <InputNumber
          v-model="baseAttr.width"
          :append="$t('sizeSetting.width')"
          @on-change="(value) => changeSize('width', value)"
        ></InputNumber>
        <Tooltip class="lock-tip" :content="$t('sizeSetting.lockRatio')">
          <Button
            class="lock-btn"
            type="text"
            :class="{ locked: lockRatio }"
            :icon="lockRatio ? 'md-lock' : 'md-unlock'"
            @click="lockRatio = !lockRatio"
          ></Button>
        </Tooltip>
        <InputNumber
          v-model="baseAttr.height"
          :append="$t('sizeSetting.height')"
          @on-change="(value) => changeSize('height', value)"
        ></InputNumber>
        <Tooltip placement="bottom-end" :content="$t('sizeSetting.resetSize')">
          <Button class="reset-btn" type="text" icon="md-repeat" @click="resetSize"></Button>
        </Tooltip>
      </div>

      <!-- 旋转 / 透明度 -->
      <div class="form-wrap">
        <AttrField :label="$t('attributes.angle')" :label-width="40">
          <Slider v-model="baseAttr.angle" :max="360" @on-input="changeAngle"></Slider>
        </AttrField>
        <AttrField :label="$t('attributes.opacity')" :label-width="40">
          <Slider v-model="baseAttr.opacity" @on-input="changeOpacity"></Slider>
        </AttrField>
      </div>
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
import InputNumber from '@/components/inputNumber';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';

export default {
  name: 'AttrDisplay',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
  },
  setup() {
    const update = getCurrentInstance();

    // 可修改的元素
    const baseType = [
      'text',
      'i-text',
      'textbox',
      'rect',
      'circle',
      'triangle',
      'polygon',
      'image',
      'group',
      'line',
      'arrow',
      'thinTailArrow',
    ];
    const { isMatchType, canvasEditor, isOne } = useSelect(baseType);

    // 属性值
    const baseAttr = reactive({
      angle: 0,
      opacity: 0,
      width: 0,
      height: 0,
    });

    // 尺寸：比例锁（默认锁定）
    const lockRatio = ref(true);

    // 尺寸修改：width/height 不变，改 scale 并绕中心缩放（保持位置）
    const applySize = (obj, newW, newH) => {
      const oldW = obj.getScaledWidth();
      const oldH = obj.getScaledHeight();
      obj.scaleX = newW / obj.width;
      obj.scaleY = newH / obj.height;
      obj.left += (oldW - obj.getScaledWidth()) / 2;
      obj.top += (oldH - obj.getScaledHeight()) / 2;
      canvasEditor.canvas.renderAll();
      baseAttr.width = obj.getScaledWidth();
      baseAttr.height = obj.getScaledHeight();
    };

    // 宽/高输入修改
    const changeSize = (key, value) => {
      const obj = canvasEditor.canvas.getActiveObjects()[0];
      if (!obj || !obj.width || !obj.height || !value) return;
      const oldW = obj.getScaledWidth();
      const oldH = obj.getScaledHeight();
      let newW = key === 'width' ? value : oldW;
      let newH = key === 'height' ? value : oldH;
      if (lockRatio.value) {
        const ratio = oldH / oldW;
        if (key === 'width') {
          newH = newW * ratio;
        } else {
          newW = newH / ratio;
        }
      }
      applySize(obj, newW, newH);
    };

    // 重置为原始尺寸（100%）
    const resetSize = () => {
      const obj = canvasEditor.canvas.getActiveObjects()[0];
      if (!obj || !obj.width || !obj.height) return;
      applySize(obj, obj.width, obj.height);
    };

    // 旋转
    const changeAngle = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.rotate(value);
        canvasEditor.canvas.renderAll();
      }
    };

    // 透明度（0-100 → 0-1）
    const changeOpacity = (value) => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set('opacity', value / 100);
        canvasEditor.canvas.renderAll();
      }
    };

    // 属性获取
    const getObjectAttr = (e) => {
      const activeObject = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== activeObject) return;
      if (activeObject && isMatchType) {
        baseAttr.angle = activeObject.get('angle') || 0;
        baseAttr.opacity = activeObject.get('opacity') * 100;
        baseAttr.width = activeObject.getScaledWidth();
        baseAttr.height = activeObject.getScaledHeight();
      }
    };

    const selectCancel = () => {
      baseAttr.width = 0;
      baseAttr.height = 0;
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
      getObjectAttr();
      canvasEditor.on('selectCancel', selectCancel);
      canvasEditor.on('selectOne', getObjectAttr);
      canvasEditor.canvas.on('object:modified', getObjectAttr);
      // 拖拽/移动/旋转过程中实时刷新尺寸与角度
      canvasEditor.canvas.on('object:moving', getObjectAttr);
      canvasEditor.canvas.on('object:rotating', getObjectAttr);
      canvasEditor.canvas.on('object:resizing', getObjectAttr);
      // 编辑态键入时实时刷新宽高（fabric 每次键入触发 text:changed）
      canvasEditor.canvas.on('text:changed', getObjectAttr);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectCancel', selectCancel);
      canvasEditor.off('selectOne', getObjectAttr);
      canvasEditor.canvas.off('object:modified', getObjectAttr);
      canvasEditor.canvas.off('object:moving', getObjectAttr);
      canvasEditor.canvas.off('object:rotating', getObjectAttr);
      canvasEditor.canvas.off('object:resizing', getObjectAttr);
      canvasEditor.canvas.off('text:changed', getObjectAttr);
    });

    return {
      isMatchType,
      canvasEditor,
      isOne,
      baseAttr,
      lockRatio,
      changeSize,
      resetSize,
      changeAngle,
      changeOpacity,
    };
  },
};
</script>

<style scoped lang="less">
@import './attrPanel/attrPanel.less';

.form-wrap {
  margin-top: 10px;
}

// 尺寸：宽 + 锁 + 高
.size-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  /deep/ .ivu-input-number {
    flex: 1;
    width: auto;
  }
  // 覆盖全局 .attr-item-box .ivu-tooltip { flex: 1 }，锁按钮不拉伸
  /deep/ .ivu-tooltip {
    flex: 0 0 auto;
  }
}
.lock-btn {
  color: #515a6e;
  &.locked {
    color: #2d8cf0;
  }
}
.reset-btn {
  color: #515a6e;
}
</style>
