<template>
  <Card dis-hover class="poster-entry" :class="{ 'is-empty': !hasValue }">
    <div slot="title" class="pe-head">
      <span class="pe-title" :title="field.title">{{ field.title }}</span>
      <span v-if="field.required" class="pe-required">*</span>
    </div>
    <div slot="extra" class="pe-right">
      <div v-if="!readonly" class="pe-tags">
        <Tag v-if="hasValue" color="success" class="pe-tag">已配置</Tag>
        <Tag v-else color="default" class="pe-tag">未配置</Tag>
        <Tag v-if="hasVariables" color="warning" class="pe-tag">含变量</Tag>
      </div>
      <!-- 头部右侧扩展位：业务操作（如证书下发的盖章上传按钮） -->
      <slot name="header-extra"></slot>
    </div>

    <!-- 预览交互舞台：预览画框 + 悬停浮层 + 查看/配置弹窗（交互与值变更内聚在 Stage 内） -->
    <PosterEntryStage
      :value="value"
      :field="field"
      :adapters="adapters"
      :sample-data="sampleData"
      :transform="transform"
      :preview-height="previewHeight"
      :readonly="readonly"
      @input="(v) => $emit('input', v)"
      @edit-page="$emit('edit-page')"
    />

    <p v-if="field.description" class="pe-desc" :title="field.description">
      <Icon type="md-information-circle" />
      {{ field.description }}
    </p>
  </Card>
</template>

<script>
import { Card, Tag, Icon } from 'view-design';
import PosterEntryStage from './PosterEntryStage.vue';
import { usePosterEntry } from './usePosterEntry';

/**
 * 海报字段卡片（业务外壳）：Card 标题/状态 Tag/描述 + 预览交互舞台（PosterEntryStage）
 * - 已配置：hover 浮层「查看」→ 查看/配置双模式弹窗
 * - 未配置：空态引导「配置海报」（打开弹窗，直接进 JSON 输入模式）
 * - 值变更（应用/删除）由 Stage 内聚处理后以 input 事件上抛，本层仅转发
 */
export default {
  name: 'PosterEntryCardHover',
  components: { Card, Tag, Icon, PosterEntryStage },
  props: {
    value: { type: String, default: '' },
    field: { type: Object, required: true },
    adapters: { type: Object, default: () => ({}) },
    sampleData: { type: Object, default: () => ({}) },
    transform: { type: Function, default: null },
    previewHeight: { type: Number, default: 260 },
    // 只读预览：隐藏标签与配置/删除等编辑入口，仅可查看
    readonly: { type: Boolean, default: false },
  },
  setup(props) {
    // 仅取解析派生（Tag 展示用）；交互与值变更在 Stage 内
    return { ...usePosterEntry(props) };
  },
};
</script>

<style lang="less" scoped>
// 白底页面：卡片以轻阴影划边界，hover 浮起提示可交互
.poster-entry {
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  }

  .pe-head {
    display: flex;
    align-items: center;
    min-width: 0;

    .pe-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .pe-required {
      margin-left: 2px;
      color: #ed4014;
      font-weight: 600;
    }
  }

  .pe-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pe-tags {
    display: flex;
    gap: 4px;

    .pe-tag {
      margin-right: 0;
    }
  }

  .pe-desc {
    margin-top: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #86909c;
  }
}
</style>
