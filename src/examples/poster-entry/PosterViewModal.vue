<template>
  <Modal
    :value="value"
    :title="modalTitle"
    width="80"
    :mask-closable="false"
    :styles="{ top: '50px' }"
    @on-visible-change="onVisibleChange"
  >
    <!-- 预览模式：大图 + 悬浮操作按钮（配置海报/删除） -->
    <template v-if="mode === 'preview'">
      <div class="pvm-preview-wrap">
        <slot name="preview" :preview="previewJson || parsed">
          <PosterPreview
            :json="previewJson || parsed"
            :data="previewData"
            :adapters="adapters"
            :options="previewOptions"
            :height="520"
            :fixed-width="620"
            :post-render="handlePostRender"
            :error="previewError"
            :warning="previewWarning"
            @error="$emit('error')"
          />
        </slot>
        <!-- 悬浮示例/原样切换：开=注入示例值渲染（默认），关=模板原样展示；纯用户数据场景隐藏 -->
        <div v-if="!pureSampleData" class="pvm-mode" @click.stop>
          <span class="pvm-mode-text">{{ modeSwitch ? '示例预览' : '原样展示' }}</span>
          <iSwitch v-model="modeSwitch" />
        </div>
        <!-- 只读预览：左上角提供下载（导出当前预览渲染的画布）；非只读时该位置为「配置海报」 -->
        <Button
          v-if="readonly"
          class="pvm-float-left"
          type="primary"
          icon="md-download"
          @click="onDownload"
        >
          下载
        </Button>
        <Button
          v-if="!readonly"
          class="pvm-float-left"
          type="primary"
          icon="md-code"
          @click="enterJsonMode"
        >
          配置海报
        </Button>
        <Button
          v-if="!readonly && deletable"
          class="pvm-float-right"
          type="error"
          ghost
          icon="md-trash"
          @click="clearConfig"
        >
          删除
        </Button>
      </div>
    </template>

    <!-- JSON 输入模式：无 JSON 打开时直接进入；预览模式点「配置海报」切换 -->
    <template v-else>
      <div class="pvm-tip">
        <Icon class="pvm-tip-icon" type="md-information-circle" :size="16" />
        <span class="pvm-tip-text">海报 JSON 通常由编辑器导出：没有现成 JSON？</span>
        <a class="pvm-tip-link" @click="goEdit">跳转编辑器页设计</a>
        <span class="pvm-tip-text">，保存后回传自动应用</span>
      </div>

      <div class="pvm-input-wrap">
        <Input v-model="text" type="textarea" :rows="10" :placeholder="placeholder" />
        <Button class="pvm-copy" type="primary" icon="md-copy" @click="copyText">复制</Button>
      </div>
      <div class="pvm-actions">
        <span v-if="error" class="pvm-error">
          <Icon type="md-warning" />
          {{ error }}
        </span>
        <span v-else-if="parseWarning" class="pvm-warning" :title="parseWarning">
          <Icon type="md-alert" />
          {{ parseWarning }}
        </span>
      </div>

      <div v-if="pending" class="pvm-preview">
        <p class="pvm-label">预览（确认无误后应用）</p>
        <div class="pvm-frame">
          <slot name="preview" :preview="pendingPreview || pending">
            <PosterPreview
              :json="pendingPreview || pending"
              :adapters="adapters"
              :options="pendingPreviewOptions"
              :height="280"
              :fixed-width="620"
              :post-render="postRender"
              :error="previewError"
              :warning="previewWarning || parseWarning"
              @error="$emit('error')"
            />
          </slot>
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="mode === 'json'">
        <Button @click="cancelJson">取消</Button>
        <Button type="primary" icon="md-checkmark" :disabled="!canApply" @click="apply">
          确认应用
        </Button>
      </template>
      <Button v-else @click="$emit('input', false)">关闭</Button>
    </template>
  </Modal>
</template>

<script>
import { ref, computed, watch, onUnmounted } from '@vue/composition-api';
import { Modal, Input, Button, Icon, Message } from 'view-design';
import PosterPreview from './PosterPreview.vue';
import { parsePosterJson } from './usePosterEntry';

/**
 * 海报查看/配置双模式弹窗（同一交互链，数据格式可插拔）
 * - 预览模式：大图 + 悬浮操作按钮（左上「配置海报」/右上「删除」），有 JSON 打开时默认；
 *   大图默认 PosterPreview（previewJson || parsed 为渲染 JSON；渲染变量数据 previewData
 *   由舞台单点派生下发，示例/原样开关联动见 sampleMode），提供 #preview 插槽时由外部渲染器接管
 *   （:preview 为预览渲染数据：previewJson || parsed；粘贴预览为 pendingPreview || pending）
 * - JSON 输入模式：回显当前配置、复制按钮悬浮输入框右上角、输入防抖自动解析出预览；
 *   外部值变更（编辑器保存回传）时，未手动编辑的 JSON 输入态自动重置并切回预览视图；
 *   校验默认 parsePosterJson（标准 objects），传 validate 钩子可支持任意数据格式
 *   （返回 { ok, error, json(应用值), preview?(预览用渲染数据) }，支持 Promise）
 * - 确认应用后不关闭弹窗，总是切回预览视图展示刚应用的配置；
 *   JSON 输入点「取消」也回到预览视图（无配置时取消即关闭弹窗）；
 *   删除仅 emit('clear')（二次确认在父层），确认清值后弹窗保持打开并自动切到 JSON 输入模式
 */
export default {
  name: 'PosterViewModal',
  components: { Modal, Input, Button, Icon, PosterPreview },
  props: {
    // v-model 显隐
    value: { type: Boolean, default: false },
    field: { type: Object, required: true },
    // 当前配置解析后的对象（null 表示未配置）
    parsed: { type: Object, default: null },
    // 当前配置对应的预览渲染数据（可选，默认用 parsed；由 Stage 经 resolvePreview 计算）
    previewJson: { type: Object, default: null },
    // 预览数据派生失败信息（如旧格式转换失败），空态时显示
    previewError: { type: String, default: '' },
    // 二级警告（非致命：如图片跨域加载失败被跳过），预览顶部黄条提示
    previewWarning: { type: String, default: '' },
    // 自定义输入校验钩子：(text, field) => { ok, error?, json, preview? } | Promise；默认标准 objects 校验
    validate: { type: Function, default: null },
    // 渲染完成钩子（透传 PosterPreview，用于渲染后布局）
    postRender: { type: Function, default: null },
    adapters: { type: Object, default: () => ({}) },
    // 渲染变量数据（舞台单点派生下发，示例/原样开关联动见 sampleMode），提供 #preview 插槽时由外部渲染器接管
    previewData: { type: Object, default: () => ({}) },
    // 大图渲染器 options（舞台 previewOptions 透传：原样模式 templateMode 开关）
    previewOptions: { type: Object, default: () => ({}) },
    // 示例/原样开关状态（受控于舞台，sample-mode.sync 双向；仅驱动开关显示与回写）
    sampleMode: { type: Boolean, default: true },
    // 纯用户数据场景：隐藏示例/原样开关（大图数据由舞台 previewData 保证严格按业务数据）
    pureSampleData: { type: Boolean, default: false },
    transform: { type: Function, default: null },
    // 只读预览：隐藏「配置海报」「删除」等编辑入口，仅可查看
    readonly: { type: Boolean, default: false },
    // 是否提供「删除」入口（如单海报业务不允许清空配置）；仅作用于非只读场景
    deletable: { type: Boolean, default: true },
    // 只读下载文件名（不含扩展名）；缺省用 field.title
    downloadName: { type: String, default: '' },
  },
  setup(props, { emit }) {
    const mode = ref('preview'); // 'preview' | 'json'
    const text = ref('');

    // 示例/原样开关（受控：写经 update:sampleMode 同步回舞台重派生，卡片/大图两处联动）；
    // 大图数据由舞台下发（previewData prop），此处不重复派生。
    // 绑定名用 modeSwitch：与 prop sampleMode 同名会触发 Vue setup/prop 冲突警告
    const modeSwitch = computed({
      get: () => props.sampleMode,
      set: (v) => emit('update:sampleMode', v),
    });
    // 待应用预览固定原样展示：直接渲染粘贴的模板 JSON（模板模式，变量 token 原样保留），
    // 与编辑器画布所见一致；不注入任何示例值
    // 恒启用模板模式：未解析变量图/背景显示编辑器同款占位，文本显示 {{key}} 字面量
    const pendingPreviewOptions = { templateMode: true };
    const pending = ref(null); // 应用值（validate 返回的 json）
    const pendingPreview = ref(null); // 预览渲染数据（validate 返回的 preview，缺省用 pending）
    const parsedText = ref('');
    const error = ref('');
    // 校验通过但存在非致命警告（如转换时图片加载失败被跳过）
    const parseWarning = ref('');

    // 回显内容：优先预览渲染数据（旧格式场景为转换后的标准 JSON，可直接进编辑器）
    const currentText = computed(() => {
      const src = props.previewJson || props.parsed;
      return src ? JSON.stringify(src, null, 2) : '';
    });

    const modalTitle = computed(() =>
      mode.value === 'preview'
        ? `${props.field.title} · 海报预览`
        : `${props.field.title} · 配置海报`
    );

    const stale = computed(() => !!pending.value && parsedText.value !== text.value);
    // 防抖/异步解析期间（stale）禁止应用，保证应用的一定是最新输入解析出的内容
    const canApply = computed(() => !!pending.value && !stale.value);

    // 异步解析守卫：新一轮输入使旧一轮结果作废
    let parseSeq = 0;
    const doParse = async (silent) => {
      const seq = ++parseSeq;
      let res;
      try {
        res = props.validate
          ? await props.validate(text.value, props.field)
          : parsePosterJson(text.value, props.field, props.transform);
      } catch (e) {
        res = { ok: false, error: (e && e.message) || '解析失败' };
      }
      if (seq !== parseSeq) return false;
      if (!res || !res.ok) {
        pending.value = null;
        pendingPreview.value = null;
        parsedText.value = '';
        if (!silent) error.value = (res && res.error) || '解析失败';
        return false;
      }
      error.value = '';
      parseWarning.value = res.warning || '';
      pending.value = res.json;
      pendingPreview.value = res.preview || res.json;
      parsedText.value = text.value;
      return true;
    };

    // 输入防抖自动解析（无手动解析按钮）
    let parseTimer = null;
    watch(text, () => {
      clearTimeout(parseTimer);
      parseTimer = setTimeout(() => {
        if (text.value) {
          doParse(false);
        } else {
          pending.value = null;
          pendingPreview.value = null;
          parsedText.value = '';
          error.value = '';
        }
      }, 400);
    });
    onUnmounted(() => clearTimeout(parseTimer));

    const enterJsonMode = () => {
      // 回显当前配置并自动解析一次，复制/应用立即可用
      text.value = currentText.value;
      pending.value = null;
      pendingPreview.value = null;
      parsedText.value = '';
      error.value = '';
      parseWarning.value = '';
      if (text.value) doParse(true);
      mode.value = 'json';
    };

    // 外部值变更（编辑器保存回传应用等）的精确区分：
    // 弹窗自身的值变更（确认应用/删除）都会先切走模式，因此「JSON 输入模式下回显内容变化」
    // 必然来自外部链路 —— 未手动编辑时重置输入态并切回预览视图展示新配置；
    // 用户已手动编辑则不打断（保持输入态，取消后仍会回到预览看到新配置）
    watch(currentText, (newText, oldText) => {
      if (mode.value !== 'json') return;
      if (text.value && text.value !== oldText) return;
      resetJsonState();
      mode.value = 'preview';
    });

    const onVisibleChange = (v) => {
      if (v) {
        // 有配置 → 预览模式；未配置 → 直接进 JSON 输入模式
        if (props.parsed) {
          mode.value = 'preview';
        } else {
          enterJsonMode();
        }
      } else if (props.value) {
        // 仅在仍认为打开时通知父级关闭，避免外部已关闭时的冗余触发
        emit('input', false);
      }
    };

    // 删除确认通过（父层清值）→ 配置置空，自动切到 JSON 输入模式（与无配置打开一致）
    watch(
      () => props.parsed,
      (v) => {
        if (!v && props.value && mode.value === 'preview') enterJsonMode();
      }
    );

    const resetJsonState = () => {
      text.value = '';
      pending.value = null;
      pendingPreview.value = null;
      parsedText.value = '';
      error.value = '';
    };

    const goEdit = () => {
      // 编辑器在新标签页打开（由容器层 window.open），弹窗保持当前状态
      emit('edit-page');
    };

    const cancelJson = () => {
      // 同一交互链：取消回到预览视图；无配置（直接进 JSON 模式）时取消即关闭弹窗
      resetJsonState();
      if (props.parsed) {
        mode.value = 'preview';
      } else {
        emit('input', false);
      }
    };

    const clearConfig = () => {
      emit('clear');
    };

    const copyToClipboard = async (str) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(str);
        } else {
          const ta = document.createElement('textarea');
          ta.value = str;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        Message.success('已复制到剪贴板');
      } catch (e) {
        Message.error('复制失败，请手动全选复制');
      }
    };

    const copyText = () => copyToClipboard(text.value);

    const apply = () => {
      if (!canApply.value) return;
      const jsonStr = JSON.stringify(pending.value);
      // 同一交互链：应用后不关闭弹窗，切回预览视图展示刚应用的配置
      // （成功提示由 usePosterEntry.applyJson 统一弹出，避免重复 toast）
      emit('applied', jsonStr);
      resetJsonState();
      mode.value = 'preview';
    };

    const placeholder = computed(
      () =>
        `粘贴海报 JSON 字符串${
          props.field.expectedSize
            ? `（期望尺寸 ${props.field.expectedSize.width}×${props.field.expectedSize.height}）`
            : ''
        }`
    );

    // 最近一次渲染完成的 fabric canvas（只读下载用，非响应式；重渲染时被新 payload 替换）
    let renderedCanvas = null;
    const handlePostRender = (payload) => {
      renderedCanvas = (payload && payload.canvas) || null;
      if (props.postRender) props.postRender(payload);
    };

    // 只读预览下载：导出当前预览渲染的画布（随示例/原样切换，所见即所得；画布背板为海报原始像素，非缩放尺寸）
    const onDownload = () => {
      if (!renderedCanvas || typeof renderedCanvas.toDataURL !== 'function') {
        Message.warning('海报尚未渲染完成，请稍后再试');
        return;
      }
      try {
        const url = renderedCanvas.toDataURL({ format: 'png' });
        const a = document.createElement('a');
        a.href = url;
        a.download = `${props.downloadName || props.field.title || '海报'}.png`;
        a.click();
      } catch (e) {
        // 图片跨域污染画布等场景
        Message.error('海报导出失败，请重试');
      }
    };

    return {
      mode,
      text,
      modeSwitch,
      pendingPreviewOptions,
      pending,
      pendingPreview,
      error,
      parseWarning,
      canApply,
      modalTitle,
      placeholder,
      enterJsonMode,
      onVisibleChange,
      goEdit,
      cancelJson,
      clearConfig,
      copyText,
      apply,
      handlePostRender,
      onDownload,
    };
  },
};
</script>

<style lang="less" scoped>
// Modal transfer 到 body，样式必须顶层（不可嵌套在卡片根类下）
.pvm-preview-wrap {
  position: relative;

  // 操作按钮悬浮画框上：左上「配置海报」/右上「删除」，阴影层次感（与浮层主按钮同风格）
  .pvm-float-left,
  .pvm-float-right {
    position: absolute;
    top: 8px;
    z-index: 2;
  }

  .pvm-float-left {
    left: 8px;
    box-shadow: 0 2px 10px rgba(45, 140, 240, 0.4);
    transition: box-shadow 0.2s;

    &:hover {
      box-shadow: 0 3px 14px rgba(45, 140, 240, 0.55);
    }
  }

  .pvm-float-right {
    right: 8px;
    box-shadow: 0 2px 10px rgba(237, 64, 20, 0.25);
  }

  // 示例/原样切换：左上悬浮于操作按钮下方（只读/编辑两种形态的左上按钮高度一致）
  .pvm-mode {
    position: absolute;
    top: 65px;
    left: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.45);
  }

  .pvm-mode-text {
    font-size: 12px;
    color: #fff;
  }
}

.pvm-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px solid #abdcff;
  border-radius: 4px;
  background: #f0faff;
  font-size: 12px;

  .pvm-tip-icon {
    color: #2d8cf0;
  }

  .pvm-tip-text {
    color: #515a6e;
  }

  .pvm-tip-link {
    color: #2d8cf0;
    cursor: pointer;
  }
}

.pvm-input-wrap {
  position: relative;

  // 复制按钮悬浮在输入框右上角，蓝色实底 + 阴影层次感（与浮层主按钮同风格）
  .pvm-copy {
    position: absolute;
    top: 8px;
    right: 24px;
    z-index: 2;
    box-shadow: 0 2px 10px rgba(45, 140, 240, 0.4);
    transition: box-shadow 0.2s;

    &:hover {
      box-shadow: 0 3px 14px rgba(45, 140, 240, 0.55);
    }
  }
}

.pvm-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 0;

  .pvm-error {
    color: #ed4014;
    font-size: 12px;
  }

  .pvm-warning {
    color: #c17f10;
    font-size: 12px;
    cursor: default;
    text-align: left;
    white-space: pre-line;
    word-break: break-all;
  }
}

.pvm-preview {
  .pvm-label {
    margin-bottom: 6px;
    font-size: 12px;
    color: #86909c;
  }

  .pvm-frame {
    border: 1px solid #e8eaec;
    border-radius: 6px;
    background: #f8f9fb;
  }
}
</style>
