<template>
  <div class="pep-frame" :class="{ 'is-empty': !hasValue }" :style="{ height: height + 'px' }">
    <template v-if="renderable">
      <div ref="stage" class="pep-stage">
        <div v-if="fit" class="pep-fit" :style="fit.box">
          <div class="pep-fit-inner" :style="fit.inner">
            <FabricRenderer
              :key="renderKey"
              :json="parsed"
              :data="data"
              :adapters="adapters"
              :options="options"
              @rendered="onRendered"
              @error="onError"
            />
          </div>
        </div>
      </div>
      <Spin v-if="rendering || !fit" class="pep-spin" size="large" fix />
      <span v-if="sizeText" class="pep-badge">{{ sizeText }}</span>
      <div v-if="warning" class="pep-warn" :title="warning">
        <Icon type="md-warning" :size="14" />
        <span class="pep-warn-text">{{ warning }}</span>
      </div>
    </template>
    <div v-else class="pep-empty">
      <slot name="empty">
        <Icon :type="error ? 'md-alert' : 'md-images'" :size="32" :color="error ? '#ed4014' : ''" />
        <p class="pep-empty-title" :class="{ 'is-error': error }">{{ error || emptyText }}</p>
      </slot>
    </div>
  </div>
</template>

<script>
import { computed, ref, watch } from '@vue/composition-api';
import { Icon, Spin } from 'view-design';
import FabricRenderer from '@/lib/FabricRenderer.vue';
import { computeFit, findWorkspace, useStageWidth } from './usePosterEntry';

/**
 * 海报预览画框（卡片与弹窗共享）
 * - contain 等比缩放：海报原始像素铺开 + transform scale，绝不撑开容器
 * - 固定高度画框；宽度默认自适应父容器（ResizeObserver），可传 fixedWidth 用于 Modal 内
 * - 渲染 loading / 失败事件 / 尺寸角标内置；空态提供 #empty 插槽
 */
export default {
  name: 'PosterPreview',
  components: { Icon, Spin, FabricRenderer },
  props: {
    // 海报 JSON（对象或字符串）
    json: { type: [Object, String], default: null },
    // 变量示例数据（预览用）
    data: { type: Object, default: () => ({}) },
    adapters: { type: Object, default: () => ({}) },
    // 渲染器 options 透传（如 templateMode：原样模式渲染未替换模板，变量图/变量背景显示占位）
    options: { type: Object, default: () => ({}) },
    // 画框高度
    height: { type: Number, default: 220 },
    // 固定画框宽度（如 Modal 内）；不传则自适应测量父容器宽度
    fixedWidth: { type: Number, default: 0 },
    // 渲染完成钩子：(payload { core, canvas })，用于渲染后布局（如旧版头像/变量图）
    postRender: { type: Function, default: null },
    // 预览数据派生失败信息（如旧格式转换失败）；非空时空态显示错误文案
    error: { type: String, default: '' },
    // 二级警告（非致命：如图片加载失败被跳过）；预览正常渲染，顶部黄条提示
    warning: { type: String, default: '' },
  },
  setup(props, { emit }) {
    const parsed = computed(() => {
      if (!props.json) return null;
      if (typeof props.json === 'string') {
        try {
          return JSON.parse(props.json);
        } catch (e) {
          return null;
        }
      }
      return props.json;
    });
    const hasValue = computed(
      () => !!(parsed.value && Array.isArray(parsed.value.objects) && parsed.value.objects.length)
    );
    const workspace = computed(() => findWorkspace(parsed.value));
    // 可渲染 = 有画布数据且 workspace 尺寸可用；否则走空态（避免 fit 恒为 null 导致永久 Spin）
    const renderable = computed(() => {
      const ws = workspace.value;
      return !!(hasValue.value && ws && ws.width && ws.height);
    });
    const emptyText = computed(() =>
      hasValue.value ? '画布数据缺少 workspace 尺寸定义' : '暂无海报'
    );
    const sizeText = computed(() => {
      const ws = workspace.value;
      return ws && ws.width ? `${ws.width}×${ws.height}` : '';
    });

    // 值变化：重置 loading、强制重挂载渲染器、重测舞台（stage 随空态切换重挂载）。
    // 注意：不监听 data（sampleData）——FabricRenderer 内部已有 data deep watch 做平滑重渲染；
    // 若在这里重挂载渲染器，旧实例 dispose 后 enliven 异步回调再 clear 画布会报
    // "Cannot read properties of null (reading 'clearRect')"
    const rendering = ref(false);
    const renderKey = ref(0);
    const { stage, stageWidth, attach } = useStageWidth();
    watch(
      () => props.json,
      () => {
        rendering.value = hasValue.value;
        renderKey.value += 1;
        attach();
      },
      { immediate: true }
    );
    // options 变化（如变量占位开关注入）也需重挂载：RendererCore 的注册能力只在
    // 构造期读取（data deep watch 平滑重渲染不会重建 core）
    watch(
      () => props.options,
      () => {
        if (!props.json) return;
        rendering.value = hasValue.value;
        renderKey.value += 1;
        attach();
      }
    );

    const boxW = computed(() => (props.fixedWidth > 0 ? props.fixedWidth : stageWidth.value));
    const fit = computed(() => computeFit(workspace.value, boxW.value, props.height));

    const onRendered = (payload) => {
      rendering.value = false;
      if (props.postRender) props.postRender(payload);
    };

    const onError = () => {
      rendering.value = false;
      emit('error');
    };

    return {
      parsed,
      hasValue,
      renderable,
      emptyText,
      sizeText,
      stage,
      fit,
      rendering,
      renderKey,
      onRendered,
      onError,
    };
  },
};
</script>

<style lang="less" scoped>
.pep-frame {
  position: relative;
  width: 100%;
  border: 1px solid #e8eaec;
  border-radius: 6px;
  background: #f8f9fb;
  overflow: hidden;

  &.is-empty {
    border-style: dashed;
    border-color: #dcdee2;
  }

  .pep-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .pep-fit {
    position: relative;
    overflow: hidden;
    border-radius: 2px;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
    background: #fff;
  }

  // 内层按海报原始像素铺开，再整体 scale 缩到画框内（布局占位由 .pep-fit 约束）
  .pep-fit-inner {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }

  .pep-spin {
    background-color: rgba(255, 255, 255, 0.6);
  }

  .pep-badge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    padding: 1px 8px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.45);
    color: #fff;
    font-size: 12px;
    line-height: 18px;
    pointer-events: none;
  }

  // 二级警告条：非阻断，预览仍完整展示；允许换行完整展示（含自定义文案中的 \n）
  .pep-warn {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    padding: 3px 8px;
    background: rgba(255, 153, 0, 0.92);
    color: #fff;
    font-size: 12px;
    line-height: 16px;
    cursor: default;

    .pep-warn-text {
      white-space: pre-line;
      word-break: break-all;
    }
  }
}

.pep-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #b8bdc7;

  .pep-empty-title {
    margin-top: 8px;
    font-size: 13px;

    &.is-error {
      color: #ed4014;
    }
  }
}
</style>
