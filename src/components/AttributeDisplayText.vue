<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:39:18
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-24 21:53:21
 * @Description: 文本展示属性面板
-->

<template>
  <div v-if="isOne && isMatchType" class="box attr-item-box">
    <Divider plain orientation="left">
      <h4>{{ $t('sizeSetting.title') }}</h4>
    </Divider>
    <div class="size-row">
      <!-- 宽度（frame 宽度，内部对接 fabric width） -->
      <InputNumber
        v-model="baseAttr.width"
        :append="$t('sizeSetting.width')"
        :min="1"
        @on-change="(value) => changeWidth(value)"
      ></InputNumber>
      <!-- 高度（尺寸锁开启时对接 frame 高度；关闭时自适应，只读） -->
      <InputNumber
        v-model="baseAttr.height"
        :append="$t('sizeSetting.height')"
        :disabled="!baseAttr.clipEnabled"
        :min="1"
        @on-change="(value) => changeHeight(value)"
      ></InputNumber>
      <!-- 尺寸锁（裁剪）：放在高度右侧 -->
      <Tooltip
        class="lock-tip"
        placement="bottom-end"
        :content="baseAttr.clipEnabled ? $t('sizeSetting.clipLockOn') : $t('sizeSetting.clipLock')"
      >
        <Button
          class="lock-btn"
          type="text"
          :class="{ locked: baseAttr.clipEnabled }"
          :icon="baseAttr.clipEnabled ? 'ios-lock' : 'ios-lock-outline'"
          @click="toggleClip"
        ></Button>
      </Tooltip>
    </div>

    <!-- 省略号开关 -->
    <AttrField split :label="$t('sizeSetting.ellipsis')">
      <iSwitch
        v-model="baseAttr.ellipsisEnabled"
        :disabled="!baseAttr.clipEnabled"
        size="small"
        @on-change="toggleEllipsis"
      ></iSwitch>
    </AttrField>

    <!-- 旋转 / 透明度 -->
    <Form :label-width="40" class="form-wrap">
      <FormItem :label="$t('attributes.angle')">
        <Slider v-model="baseAttr.angle" :max="360" @on-input="changeAngle"></Slider>
      </FormItem>
      <FormItem :label="$t('attributes.opacity')">
        <Slider v-model="baseAttr.opacity" @on-input="changeOpacity"></Slider>
      </FormItem>
    </Form>
  </div>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';

export default {
  name: 'AttrDisplayText',
  components: {
    InputNumber,
  },
  setup() {
    const update = getCurrentInstance();

    // 仅 textbox 展示
    const { isMatchType, canvasEditor, isOne } = useSelect(['textbox']);

    const baseAttr = reactive({
      angle: 0,
      opacity: 0,
      width: 0,
      height: 0,
      clipEnabled: false,
      ellipsisEnabled: false,
    });

    const getObj = () => canvasEditor.canvas.getActiveObjects()[0];

    // 属性获取
    const getObjectAttr = (e) => {
      const obj = canvasEditor.canvas.getActiveObject();
      // 不是当前obj，跳过
      if (e && e.target && e.target !== obj) return;
      if (!obj || obj.type !== 'textbox') return;
      baseAttr.width = obj.width;
      baseAttr.clipEnabled = !!obj.clipEnabled;
      baseAttr.ellipsisEnabled = !!obj.ellipsisEnabled;
      // 高度：尺寸锁开启时读 frame（frameHeight），否则读自适应高度
      baseAttr.height = obj.clipEnabled ? obj.frameHeight || 0 : obj.getScaledHeight();
      baseAttr.angle = obj.get('angle') || 0;
      baseAttr.opacity = obj.get('opacity') * 100;
    };

    // 宽度：直接改 fabric width（裁剪跟随 _render 自动生效）
    const changeWidth = (value) => {
      const obj = getObj();
      if (!obj || !value) return;
      obj.set({ width: value });
      obj.clipEnabled && obj.syncFrame();
      obj.initDimensions && obj.initDimensions();
      canvasEditor.canvas.renderAll();
      baseAttr.width = obj.width;
    };

    // 高度：改 frame（frameHeight）
    const changeHeight = (value) => {
      const obj = getObj();
      if (!obj || !value) return;
      if (obj.clipEnabled) {
        obj.setFrameHeight(value);
        canvasEditor.canvas.renderAll();
      }
      baseAttr.height = value;
    };

    // 尺寸锁（裁剪）开关
    const toggleClip = () => {
      const obj = getObj();
      if (!obj) return;
      const next = !baseAttr.clipEnabled;
      if (next) {
        obj.set({ clipEnabled: true });
        // 开启时 frame 高度初始化为当前自适应高度
        obj.syncFrame();
      } else {
        obj.set({ clipEnabled: false });
        obj.syncFrame();
      }
      obj.initDimensions && obj.initDimensions();
      // 尺寸锁关闭时隐藏上/下手柄
      obj.setControlsVisibility({ mt: next, mb: next });
      canvasEditor.canvas.renderAll();
      baseAttr.clipEnabled = next;
      baseAttr.height = next ? obj.frameHeight || 0 : obj.getScaledHeight();
    };

    // 省略号开关
    const toggleEllipsis = (value) => {
      const obj = getObj();
      if (!obj) return;
      obj.set({ ellipsisEnabled: value });
      obj.set('dirty', true);
      obj.initDimensions && obj.initDimensions();
      canvasEditor.canvas.requestRenderAll();
      baseAttr.ellipsisEnabled = value;
    };

    // 旋转
    const changeAngle = (value) => {
      const obj = getObj();
      if (obj) {
        obj.rotate(value);
        canvasEditor.canvas.renderAll();
      }
    };

    // 透明度（0-100 → 0-1）
    const changeOpacity = (value) => {
      const obj = getObj();
      if (obj) {
        obj.set('opacity', value / 100);
        canvasEditor.canvas.renderAll();
      }
    };

    const selectCancel = () => {
      baseAttr.width = 0;
      baseAttr.height = 0;
      baseAttr.clipEnabled = false;
      baseAttr.ellipsisEnabled = false;
      update && update.proxy && update.proxy.$forceUpdate();
    };

    onMounted(() => {
      getObjectAttr();
      canvasEditor.on('selectCancel', selectCancel);
      canvasEditor.on('selectOne', getObjectAttr);
      canvasEditor.canvas.on('object:modified', getObjectAttr);
      // 拖拽/移动/旋转过程中实时刷新尺寸
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
      changeWidth,
      changeHeight,
      toggleClip,
      toggleEllipsis,
      changeAngle,
      changeOpacity,
    };
  },
};
</script>

<style scoped lang="less">
.ivu-form-item {
  background: #f6f7f9;
  border-radius: 5px;
  padding: 0 5px;
  margin-bottom: 10px;
}
.form-wrap {
  margin-top: 10px;
}

// 尺寸：宽 + 高 + 尺寸锁
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

// 省略号开关
.ellipsis-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  margin-bottom: 8px;
  background: #f6f7f9;
  border-radius: 5px;
  .ellipsis-label {
    font-size: 14px;
  }
}
</style>
