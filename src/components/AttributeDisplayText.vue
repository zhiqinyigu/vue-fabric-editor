<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:39:18
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-24 21:53:21
 * @Description: 文本展示属性面板
-->

<template>
  <AttrSection v-if="isOne && isMatchType" :title="$t('sizeSetting.title')">
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
          :icon="baseAttr.clipEnabled ? 'md-lock' : 'md-unlock'"
          @click="toggleClip"
        ></Button>
      </Tooltip>
    </div>

    <!-- 省略号开关 -->
    <AttrField split :label="$t('sizeSetting.ellipsis')">
      <iSwitch
        v-model="baseAttr.ellipsisEnabled"
        :disabled="!baseAttr.clipEnabled && !(baseAttr.autoGrow && baseAttr.autoGrowMaxHeight)"
        size="small"
        @on-change="toggleEllipsis"
      ></iSwitch>
    </AttrField>

    <!-- 自适应增高：尺寸锁关闭时可用，内容增高时海报自动变高 -->
    <AttrGroup>
      <template #head>
        <AttrField split bare>
          <template #label>
            <span class="auto-grow-label">{{ $t('sizeSetting.autoGrow') }}</span>
            <Tooltip placement="top" :content="$t('sizeSetting.autoGrowTip')">
              <Icon type="ios-help-circle-outline" size="18" />
            </Tooltip>
          </template>
          <iSwitch
            v-model="baseAttr.autoGrow"
            :disabled="baseAttr.clipEnabled"
            size="small"
            @on-change="toggleAutoGrow"
          ></iSwitch>
        </AttrField>
      </template>
      <!-- 最小高度 / 最大高度：仅开启自适应增高后显示 -->
      <template v-if="baseAttr.autoGrow">
        <div class="auto-grow-margin">
          <AttrField split bare :label="$t('sizeSetting.autoGrowMinHeight')">
            <InputNumber
              v-model="baseAttr.autoGrowMinHeight"
              placeholder="0"
              :min="0"
              @on-change="changeAutoGrowMinHeight"
            ></InputNumber>
          </AttrField>
          <AttrField split bare :label="$t('sizeSetting.autoGrowMaxHeight')">
            <InputNumber
              v-model="baseAttr.autoGrowMaxHeight"
              class="auto-grow-max-height"
              placeholder="∞"
              :min="0"
              @on-change="changeAutoGrowMaxHeight"
            ></InputNumber>
          </AttrField>
        </div>
      </template>
    </AttrGroup>

    <!-- 旋转 / 透明度 -->
    <div class="form-wrap">
      <AttrField :label="$t('attributes.angle')" :label-width="40">
        <Slider v-model="baseAttr.angle" :max="360" @on-input="changeAngle"></Slider>
      </AttrField>
      <AttrField :label="$t('attributes.opacity')" :label-width="40">
        <Slider v-model="baseAttr.opacity" @on-input="changeOpacity"></Slider>
      </AttrField>
    </div>
  </AttrSection>
</template>

<script>
import { reactive, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import useSelect from '@/hooks/select';
import InputNumber from '@/components/inputNumber';
import AttrSection from '@/components/attrPanel/AttrSection.vue';
import AttrField from '@/components/attrPanel/AttrField.vue';
import AttrGroup from '@/components/attrPanel/AttrGroup.vue';

export default {
  name: 'AttrDisplayText',
  components: {
    InputNumber,
    AttrSection,
    AttrField,
    AttrGroup,
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
      autoGrow: false,
      autoGrowMinHeight: null,
      autoGrowMaxHeight: null,
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
      // 自适应增高：读 AutoGrowPlugin 配置
      const growPlugin = canvasEditor.getPlugin('AutoGrowPlugin');
      if (growPlugin && growPlugin.getAutoGrowInfo) {
        const info = growPlugin.getAutoGrowInfo(obj);
        baseAttr.autoGrow = info.autoGrow;
        baseAttr.autoGrowMinHeight = info.autoGrowMinHeight;
        baseAttr.autoGrowMaxHeight = info.autoGrowMaxHeight;
      } else {
        baseAttr.autoGrow = !!obj.autoGrow;
        baseAttr.autoGrowMinHeight = Number(obj.autoGrowMinHeight) || null;
        baseAttr.autoGrowMaxHeight = Number(obj.autoGrowMaxHeight) || null;
      }
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

    // 尺寸锁（裁剪）开关：与自适应增高互斥
    const toggleClip = () => {
      const obj = getObj();
      if (!obj) return;
      const next = !baseAttr.clipEnabled;
      if (next) {
        obj.set({ clipEnabled: true, autoGrow: false });
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
      baseAttr.autoGrow = false;
      baseAttr.height = next ? obj.frameHeight || 0 : obj.getScaledHeight();
    };

    // 自适应增高开关（尺寸锁开启时不可用，由模板 :disabled 保证）
    const toggleAutoGrow = (value) => {
      const obj = getObj();
      if (!obj) return;
      const growPlugin = canvasEditor.getPlugin('AutoGrowPlugin');
      if (growPlugin && growPlugin.setAutoGrow) {
        growPlugin.setAutoGrow(obj, value, baseAttr.autoGrowMinHeight, baseAttr.autoGrowMaxHeight);
      } else {
        obj.set({ autoGrow: !!value });
        canvasEditor.canvas.requestRenderAll();
      }
      baseAttr.autoGrow = !!value;
    };

    // 自适应增高最小高度
    const changeAutoGrowMinHeight = (value) => {
      const obj = getObj();
      if (!obj) return;
      const v = Number(value) || null;
      const growPlugin = canvasEditor.getPlugin('AutoGrowPlugin');
      if (growPlugin && growPlugin.setAutoGrow) {
        growPlugin.setAutoGrow(obj, baseAttr.autoGrow, v, baseAttr.autoGrowMaxHeight);
      } else {
        obj.set({ autoGrowMinHeight: v });
        obj.set('dirty', true);
        obj.initDimensions && obj.initDimensions();
        canvasEditor.canvas.requestRenderAll();
      }
      baseAttr.autoGrowMinHeight = v;
    };

    // 自适应增高最大高度
    const changeAutoGrowMaxHeight = (value) => {
      const obj = getObj();
      if (!obj) return;
      const v = Number(value) || null;
      const growPlugin = canvasEditor.getPlugin('AutoGrowPlugin');
      if (growPlugin && growPlugin.setAutoGrow) {
        growPlugin.setAutoGrow(obj, baseAttr.autoGrow, baseAttr.autoGrowMinHeight, v);
      } else {
        obj.set({ autoGrowMaxHeight: v });
        obj.set('dirty', true);
        obj.initDimensions && obj.initDimensions();
        canvasEditor.canvas.requestRenderAll();
      }
      baseAttr.autoGrowMaxHeight = v;
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
      baseAttr.autoGrow = false;
      baseAttr.autoGrowMinHeight = null;
      baseAttr.autoGrowMaxHeight = null;
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
      toggleAutoGrow,
      changeAutoGrowMinHeight,
      changeAutoGrowMaxHeight,
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

// 自适应增高：展开区二级容器（内层行由 AttrToggleGroup 灰底 + AttrField split bare 提供）
.auto-grow-margin {
  padding-top: 6px;
}

/deep/ .auto-grow-max-height input::placeholder {
  font-size: 22px;
}
</style>
