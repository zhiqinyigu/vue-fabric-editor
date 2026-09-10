<template>
  <div>
    <!-- 预览 + 悬停浮层（图库素材风格，仅已配置时出现） -->
    <div class="pes-wrap">
      <PosterPreview
        :json="previewJson || parsed"
        :data="previewData"
        :adapters="adapters"
        :options="previewOptions"
        :height="previewHeight"
        :post-render="postRender"
        :error="previewError"
        :warning="previewWarning"
        @error="onPreviewError"
      >
        <template #empty>
          <template v-if="previewError">
            <Icon type="md-alert" :size="32" color="#ed4014" />
            <p class="pes-empty-title pes-empty-error">{{ previewError }}</p>
          </template>
          <template v-else>
            <Icon type="md-images" :size="32" />
            <p class="pes-empty-title">暂无海报</p>
          </template>
          <div v-if="!readonly" class="pes-empty-btns">
            <Button size="small" type="primary" icon="md-code" @click="visible = true">
              配置海报
            </Button>
          </div>
        </template>
      </PosterPreview>

      <!-- 浮层仅已配置时出现：示例/原样切换（左上悬浮）+ 查看（大号圆形主按钮），删除收敛在弹窗内 -->
      <div v-if="hasValue" class="pes-overlay">
        <div v-if="!pureSampleData" class="pes-mode" @click.stop>
          <span class="pes-mode-text">{{ sampleMode ? '示例预览' : '原样展示' }}</span>
          <iSwitch v-model="sampleMode" />
        </div>
        <Button
          class="pes-main"
          size="large"
          type="primary"
          shape="circle"
          icon="md-eye"
          @click="visible = true"
        >
          查看
        </Button>
      </div>
    </div>

    <!-- 查看/配置双模式弹窗：预览 ↔ JSON 输入 -->
    <PosterViewModal
      v-model="visible"
      :field="field"
      :parsed="parsed"
      :preview-json="previewJson"
      :preview-error="previewError"
      :preview-warning="previewWarning"
      :validate="validate"
      :adapters="adapters"
      :preview-data="previewData"
      :preview-options="previewOptions"
      :transform="transform"
      :sample-mode.sync="sampleMode"
      :pure-sample-data="pureSampleData"
      :post-render="postRender"
      :readonly="readonly"
      :deletable="deletable"
      :download-name="downloadName"
      @edit-page="$emit('edit-page')"
      @clear="onClear"
      @applied="onApplied"
      @error="onPreviewError"
    />
  </div>
</template>

<script>
import { ref, computed, watch } from '@vue/composition-api';
import { Button, Icon, Message, Modal } from 'view-design';
import PosterPreview from './PosterPreview.vue';
import PosterViewModal from './PosterViewModal.vue';
import { usePosterEntry } from './usePosterEntry';

/**
 * 海报预览交互舞台（UI 中性，与业务外壳解耦，可独立使用）
 * - 预览画框（PosterPreview）：已配置渲染海报，空态提供「配置海报」引导
 * - 悬停浮层：已配置 hover 显示「查看」与示例/原样切换（状态由舞台持有，弹窗内联动），
 *   打开双模式弹窗
 * - 查看/配置双模式弹窗（PosterViewModal）：预览大图 ↔ JSON 输入，
 *   复制导出/跳编辑页/删除收敛在内
 * - 值变更内聚：应用（弹窗确认）/删除（二次确认）后 emit('input', 新值字符串) 并提示；
 *   预览渲染失败自行 Message 提示
 *
 * 数据流：value(json 字符串) 进 → 内部解析派生 → 值变更经 input 出（单向）
 *
 * 数据格式可插拔（默认标准 objects JSON）：
 * - isConfigured(parsed) => Boolean：已配置判断（如旧版 posterConfig 兼容场景）
 * - resolvePreview(value, parsed) => Promise<Object>：预览渲染数据派生
 *   （如旧格式 → 标准 JSON 转换；结果同时用于卡片预览、弹窗大图与 JSON 回显；
 *   派生失败信息经 previewError prop 传入，预览空态时直接渲染到 UI）
 * - validate(text, field) => { ok, error?, json, preview? }：弹窗输入校验钩子
 * - postRender({ core, canvas })：渲染后布局钩子（如旧版头像/变量图）
 *
 * 事件：
 * - input(jsonStr)：值变更（应用新配置 / 删除传空字符串）
 * - edit-page：跳转编辑器页（由容器层 window.open）
 */
export default {
  name: 'PosterEntryStage',
  components: { Button, Icon, PosterPreview, PosterViewModal },
  props: {
    // 海报 JSON 字符串（'' 表示未配置）
    value: { type: String, default: '' },
    field: { type: Object, required: true },
    // 已配置判断钩子（默认标准 objects 判断）
    isConfigured: { type: Function, default: null },
    // 预览渲染数据派生钩子（异步）
    resolvePreview: { type: Function, default: null },
    // 弹窗输入校验钩子（透传 PosterViewModal）
    validate: { type: Function, default: null },
    // 渲染后布局钩子（透传 PosterPreview）
    postRender: { type: Function, default: null },
    // 预览数据派生失败信息（如旧格式转换失败），预览空态时显示
    previewError: { type: String, default: '' },
    // 二级警告（非致命：如图片跨域加载失败被跳过），预览顶部黄条提示
    previewWarning: { type: String, default: '' },
    adapters: { type: Object, default: () => ({}) },
    sampleData: { type: Object, default: () => ({}) },
    // 纯用户数据场景：预览恒按业务 sampleData 渲染，隐藏示例/原样开关（透传 PosterViewModal）
    pureSampleData: { type: Boolean, default: false },
    transform: { type: Function, default: null },
    previewHeight: { type: Number, default: 260 },
    // 只读预览：隐藏配置/删除等编辑入口，仅可查看（hover「查看」保留）
    readonly: { type: Boolean, default: false },
    // 是否提供「删除」入口（透传 PosterViewModal；如单海报业务不允许清空配置）
    deletable: { type: Boolean, default: true },
    // 只读下载文件名（不含扩展名）；缺省用 field.title
    downloadName: { type: String, default: '' },
  },
  setup(props, { emit }) {
    const { parsed, hasValue: stdHasValue } = usePosterEntry(props);
    // 已配置判断：格式可插拔（旧格式无 objects，需外部钩子判断）
    const hasValue = computed(() =>
      props.isConfigured ? !!props.isConfigured(parsed.value) : stdHasValue.value
    );

    // 预览渲染数据派生（异步，竞态守卫）：卡片预览/弹窗大图/JSON 回显共用
    const previewJson = ref(null);
    let previewSeq = 0;
    watch(
      () => props.value,
      async (v) => {
        const seq = ++previewSeq;
        if (!props.resolvePreview || !v) {
          previewJson.value = null;
          return;
        }
        try {
          const json = await props.resolvePreview(v, parsed.value);
          if (seq === previewSeq) previewJson.value = json || null;
        } catch (e) {
          if (seq === previewSeq) previewJson.value = null;
        }
      },
      { immediate: true }
    );

    const visible = ref(false);

    // 示例/原样切换（对应编辑器「快速预览/原样展示」二态）。状态与派生均为舞台单点，
    // 卡片与弹窗大图共用，弹窗内开关经 sample-mode.sync 回写；JSON 输入的待应用预览固定原样
    const sampleMode = ref(true);
    // 示例模式：严格按外部 sampleData 渲染（缺值字段的构造由外部负责，空字段走渲染器原生语义）；
    // 原样模式：不注入任何数据，交由 FabricRenderer 模板模式渲染（未解析变量与编辑器画布同表现）
    const previewData = computed(() => {
      // 纯用户数据场景：恒按业务 sampleData 渲染（开关已隐藏，防状态残留）
      if (props.pureSampleData) return props.sampleData;
      return sampleMode.value ? props.sampleData : null;
    });
    // 原样模式 = FabricRenderer 模板模式（token 原样保留 → 变量图/变量背景占位、文本字面量、
    // QR 为字面量内容的码，与编辑器画布一致）；示例模式与纯用户数据场景关闭（走替换后的原始渲染）
    const previewOptions = computed(() => ({
      templateMode: !props.pureSampleData && !sampleMode.value,
    }));

    const onPreviewError = () => {
      Message.error(`「${props.field.title}」预览渲染失败，请检查 JSON 与图片地址`);
    };

    // 弹窗内确认应用 → 回传新值（成功提示由弹窗层统一弹出）
    const onApplied = (jsonStr) => {
      emit('input', jsonStr);
    };

    // 删除当前配置：二次确认后回传空值
    const onClear = () => {
      Modal.confirm({
        title: '删除确认',
        content: `确定删除「${props.field.title}」的海报配置吗？`,
        onOk: () => {
          emit('input', '');
          Message.success(`「${props.field.title}」已删除`);
        },
      });
    };

    return {
      parsed,
      hasValue,
      previewJson,
      visible,
      sampleMode,
      previewData,
      previewOptions,
      onPreviewError,
      onApplied,
      onClear,
    };
  },
};
</script>

<style lang="less" scoped>
.pes-empty-title {
  font-size: 13px;
}

.pes-empty-error {
  color: #ed4014;
}

.pes-empty-btns {
  margin-top: 10px;
}

.pes-wrap {
  position: relative;
  max-width: 450px;

  // hover 渐变遮罩：默认隐藏，不拦截点击
  .pes-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.55));
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  &:hover .pes-overlay {
    opacity: 1;
    pointer-events: auto;
  }

  // 示例/原样切换：左上悬浮（随浮层 hover 出现），深色底保证海报上的可读性
  .pes-mode {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.45);
  }

  .pes-mode-text {
    font-size: 12px;
    color: #fff;
  }

  .pes-main {
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }
}
</style>
