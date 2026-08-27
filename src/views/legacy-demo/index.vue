<template>
  <div class="legacy-demo">
    <div class="ld-side">
      <Card dis-hover>
        <p slot="title">旧数据（oldjson.js 格式）</p>
        <div class="ld-form">
          <label class="ld-label">背景图 URL（决定海报尺寸）</label>
          <Input v-model="config.background" placeholder="背景图 URL，留空则用包围盒" />
          <label class="ld-label">头像 URL（scope.avatar）</label>
          <Input v-model="scope.avatar" placeholder="https://picsum.photos/seed/avatar/240/240" />
          <label class="ld-label">分享链接（二维码内容）</label>
          <Input v-model="shareUrl" placeholder="https://example.com/share?uid=1" />
          <label class="ld-label">预生成二维码图片（shareCode，优先于动态生成）</label>
          <Input v-model="shareCode" placeholder="二维码图片 URL 或 dataURL，留空则动态生成" />
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">变量作用域（scope，按 JSON 动态识别）</p>
        <div class="ld-form">
          <template v-if="scopeVars.length">
            <div v-for="v in scopeVars" :key="v" class="ld-field">
              <label class="ld-label">{{ tokenOf(v) }}</label>
              <Input
                :value="scope[v]"
                :placeholder="tokenOf(v)"
                @input="(val) => setScopeVar(v, val)"
              />
            </div>
          </template>
          <p v-else class="ld-status">JSON 中未检测到变量占位符</p>
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">粘贴 JSON（覆盖示例，自动识别新旧格式）</p>
        <Input
          v-model="pasteJson"
          type="textarea"
          :rows="10"
          placeholder='旧格式 posterConfig（background/text[]/img[]…）或新格式 {"objects":[...]}，LegacyFabricRenderer 自动识别'
        />
        <div class="ld-actions ld-json-actions">
          <Button type="primary" size="small" @click="onApplyJson">应用 JSON</Button>
          <Button size="small" @click="onResetJson">重置示例</Button>
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">操作</p>
        <div class="ld-form">
          <label class="ld-label">展示模式</label>
          <RadioGroup v-model="displayMode" type="button" size="small">
            <Radio label="img">图片（img）</Radio>
            <Radio label="canvas">画布（canvas）</Radio>
          </RadioGroup>
        </div>
        <div class="ld-actions">
          <Button type="primary" :disabled="!posterSrc && !canvasMeta" @click="onDownload">
            下载 PNG
          </Button>
          <Button @click="onRerender">重新渲染</Button>
          <Button @click="showJson = !showJson">{{ showJson ? '隐藏' : '查看' }}转换后 JSON</Button>
        </div>
        <div v-if="showJson" class="ld-json">
          <textarea :value="convertedJsonText" readonly rows="14" />
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">状态</p>
        <p class="ld-status">{{ status }}</p>
      </Card>
    </div>

    <div ref="stage" class="ld-stage">
      <div class="ld-poster-fit" :style="posterFitStyle">
        <LegacyFabricRenderer
          :key="renderKey"
          :poster-config="config"
          :scope="scope"
          :share-url="shareUrl"
          :share-code="shareCode"
          :display-mode="displayMode"
          @ready="onReady"
          @update="onUpdate"
          @render="onRender"
          @preview-fail="onPreviewFail"
          @error="onError"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { computed, onBeforeUnmount, onMounted, ref, watch } from '@vue/composition-api';
import { Card, Input, Button, Message, RadioGroup, Radio } from 'view-design';
import LegacyFabricRenderer from '@/examples/smart-poster/legacy/LegacyFabricRenderer.vue';

// 顶层含 objects[] 即为 FabricEditor 导出的标准 fabric JSON，否则是旧 posterConfig
function isStandardConfig(cfg) {
  return !!(cfg && cfg.objects && Array.isArray(cfg.objects));
}

// 递归收集 JSON 中的变量名：同时匹配新格式 {{a}} 与旧格式 {a}
// jsonList[].json 是字符串化 fabric JSON：先解析再递归收集，
// 避免把 JSON 结构片段（如 {type:"linear"}）误当作变量名。
function collectVarTokens(value, into) {
  if (value == null) return into;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      try {
        return collectVarTokens(JSON.parse(trimmed), into);
      } catch (e) {
        // 非合法 JSON 字符串，按普通文本提取
      }
    }
    const re = /\{\{([\s\S]+?)\}\}|\{([^{}]+)\}/g;
    let m;
    while ((m = re.exec(value))) {
      const name = (m[1] != null ? m[1] : m[2] || '').trim();
      if (name) into.add(name);
    }
    return into;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectVarTokens(v, into));
    return into;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((k) => collectVarTokens(value[k], into));
  }
  return into;
}

export default {
  name: 'LegacyDemo',
  components: { LegacyFabricRenderer, Card, Input, Button, RadioGroup, Radio },
  setup() {
    const DEFAULT_JSON = {
      background: 'https://picsum.photos/seed/ttff/1080/1440',
    };
    const DEFAULT_SHARE_URL = 'https://example.com/share?uid=10086';
    const config = ref({ ...DEFAULT_JSON });
    // 旧格式转换会用到的注入变量默认值（nickname 由 converter 固化、avatar 有独立输入框）
    const SCOPE_DEFAULTS = {
      nickname: '王小明',
      avatar: 'https://picsum.photos/seed/avatar/240/240',
    };
    const scope = ref({ ...SCOPE_DEFAULTS });
    const shareUrl = ref(DEFAULT_SHARE_URL);
    const shareCode = ref('');
    const pasteJson = ref('');
    const status = ref('待渲染');
    const posterSrc = ref('');
    const showJson = ref(false);
    const convertedJsonText = ref('');
    const renderKey = ref(0);
    // 展示模式切换：img（默认，渲染导出图片）/ canvas（直接展示画布）
    const displayMode = ref('img');

    // 渲染触发唯一入口：所有"需要重建海报"的动作都汇聚到 renderKey
    // - rerender：立即重建（模式切换、手动重新渲染）
    // - scheduleRerender：防抖 250ms（配置 / scope / 分享入参的 Live 预览）
    let rerenderTimer = null;
    const rerender = (msg) => {
      if (msg) status.value = msg;
      renderKey.value += 1;
    };
    const scheduleRerender = (msg) => {
      if (msg) status.value = msg;
      clearTimeout(rerenderTimer);
      rerenderTimer = setTimeout(() => {
        renderKey.value += 1;
      }, 250);
    };
    // 模式切换走完整重渲染：canvas 模式跳过图片导出、img 模式需要导出，互不共享结果
    watch(displayMode, () => rerender());

    // 预览区适配：监听舞台内容区尺寸，canvas 模式下按画布比例算出最大可容纳的展示尺寸
    const stage = ref(null);
    const stageBox = ref({ w: 0, h: 0 });
    const canvasMeta = ref(null);
    // 渲染器核心（canvas 模式按需导出 PNG 用），ready 事件注入
    const rendererCore = ref(null);
    let stageRO = null;
    const measureStage = () => {
      const el = stage.value;
      if (!el) return;
      const cs = getComputedStyle(el);
      stageBox.value = {
        w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      };
    };
    onMounted(() => {
      measureStage();
      stageRO = new ResizeObserver(measureStage);
      stageRO.observe(stage.value);
    });
    onBeforeUnmount(() => {
      if (stageRO) stageRO.disconnect();
      stageRO = null;
    });
    // canvas 展示（直接选择 或 img 导出失败自动回退）：限制海报展示宽高不超过舞台
    // 内容区（contain 等比缩放），避免出现滚动条。判断依据以"是否真在展示 canvas"
    // 为准：img 成功路径 emit('render', src) 不带尺寸 meta → 不适配；
    // canvas 模式与回退路径 emit('render', null, {width, height}) → 都适配
    const posterFitStyle = computed(() => {
      const meta = canvasMeta.value;
      const { w, h } = stageBox.value;
      if (!meta || !w || !h) return null;
      const scale = Math.min(w / meta.width, h / meta.height);
      return {
        width: `${Math.floor(meta.width * scale)}px`,
        height: `${Math.floor(meta.height * scale)}px`,
      };
    });

    const scopeMode = computed(() => (isStandardConfig(config.value) ? 'standard' : 'legacy'));
    const tokenOf = (v) => (scopeMode.value === 'standard' ? `{{${v}}}` : `{${v}}`);
    // 动态变量名：JSON 内容收集；旧格式额外补 nickname（converter 会固化 {{nickname}}）；
    // avatar 已在"旧数据"卡片有独立输入框，这里不再重复展示。
    const scopeVars = computed(() => {
      const set = collectVarTokens(config.value, new Set());
      if (scopeMode.value !== 'standard' && !set.has('nickname')) set.add('nickname');
      return Array.from(set).filter((v) => v !== 'avatar');
    });
    // 按变量表重建 scope：保留已有值，新变量补默认值，多余字段清理；
    // 结果与现 scope 一致时不替换，避免触发 scope watcher 造成无谓的重渲染
    const rebuildScope = () => {
      const prev = scope.value || {};
      const next = { avatar: prev.avatar !== undefined ? prev.avatar : SCOPE_DEFAULTS.avatar };
      scopeVars.value.forEach((v) => {
        next[v] = prev[v] !== undefined ? prev[v] : SCOPE_DEFAULTS[v] || '';
      });
      if (
        Object.keys(next).length === Object.keys(prev).length &&
        Object.keys(next).every((k) => next[k] === prev[k])
      ) {
        return;
      }
      scope.value = next;
    };
    const setScopeVar = (path, value) => {
      scope.value = { ...scope.value, [path]: value };
    };

    // 配置变化（背景图输入、应用/重置 JSON）→ 重建 scope + 防抖重渲染
    watch(
      () => config.value,
      () => {
        rebuildScope();
        scheduleRerender();
      },
      { deep: true }
    );
    // scope 编辑（头像、动态变量）→ 防抖重渲染（Live 预览）
    watch(scope, () => scheduleRerender(), { deep: true });
    // 分享链接 / 二维码图片变化 → 防抖重渲染
    watch([shareUrl, shareCode], () => scheduleRerender());
    rebuildScope();

    const onUpdate = (json) => {
      convertedJsonText.value = JSON.stringify(json, null, 2);
      status.value = '已转换，渲染中…';
    };

    const onReady = ({ core }) => {
      rendererCore.value = core;
    };

    const onRender = (src, meta) => {
      posterSrc.value = src || '';
      canvasMeta.value = meta || null;
      status.value = src ? '渲染完成（' + src.length + ' chars）' : '渲染完成（canvas 展示）';
    };

    const onError = (e) => {
      status.value = '渲染失败：' + (e && e.message);
      Message.error(status.value);
    };

    // img 模式导出失败（画布被跨域图污染）→ 渲染器已自动切画布展示，仅提示一次
    let warnedPreviewFail = false;
    const onPreviewFail = () => {
      if (warnedPreviewFail) return;
      warnedPreviewFail = true;
      status.value = '图片服务未放行 CORS（跨域污染画布），导出受限，已切换画布展示';
      Message.warning(status.value);
    };

    const onDownload = async () => {
      // canvas 模式未导出过图片：按需调用 ServersPlugin.preview 导出并缓存
      let src = posterSrc.value;
      if (!src && rendererCore.value) {
        status.value = '正在导出图片…';
        try {
          const servers = rendererCore.value.getPlugin('ServersPlugin');
          if (servers && typeof servers.preview === 'function') {
            src = await servers.preview(1);
            // 画布被跨域图片污染时 preview 返回 null（servers 已 emit save:error）
            if (!src) {
              status.value = '导出失败：画布包含跨域图片';
              Message.error(status.value);
              return;
            }
            posterSrc.value = src;
          }
        } catch (e) {
          status.value = '导出失败：' + (e && e.message);
          Message.error(status.value);
          return;
        }
      }
      if (!src) return;
      const a = document.createElement('a');
      a.href = src;
      a.download = 'legacy-poster.png';
      a.click();
      status.value = '已下载 PNG';
    };

    const onRerender = () => {
      rerender('重新渲染中…');
    };

    const onApplyJson = () => {
      const text = (pasteJson.value || '').trim();
      if (!text) {
        Message.warning('请先粘贴 JSON');
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        Message.error('JSON 解析失败：' + e.message);
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        Message.error('JSON 必须是对象');
        return;
      }
      // 新旧格式均交给 LegacyFabricRenderer 自动识别（顶层 objects[] 为标准 fabric JSON）；
      // config watcher 已负责重建 scope，这里只负责触发与状态提示
      config.value = parsed;
      scheduleRerender('已应用粘贴的 JSON，渲染中…');
      Message.success('已应用 JSON');
    };

    const onResetJson = () => {
      pasteJson.value = '';
      shareUrl.value = DEFAULT_SHARE_URL;
      shareCode.value = '';
      scope.value = { ...SCOPE_DEFAULTS };
      config.value = { ...DEFAULT_JSON };
      scheduleRerender('已重置示例，渲染中…');
    };

    return {
      config,
      pasteJson,
      onApplyJson,
      onResetJson,
      scope,
      scopeVars,
      tokenOf,
      setScopeVar,
      shareUrl,
      shareCode,
      status,
      posterSrc,
      showJson,
      convertedJsonText,
      renderKey,
      displayMode,
      stage,
      posterFitStyle,
      canvasMeta,
      onReady,
      onUpdate,
      onRender,
      onPreviewFail,
      onError,
      onDownload,
      onRerender,
    };
  },
};
</script>

<style lang="less" scoped>
.legacy-demo {
  height: 100vh;
  display: flex;
  gap: 16px;
  padding: 16px;
  box-sizing: border-box;
  background: #f1f2f5;
}
.ld-side {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.ld-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ld-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ld-label {
  font-size: 12px;
  color: #86909c;
  margin-top: 6px;
}
.ld-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.ld-json-actions {
  margin-top: 10px;
}
.ld-json {
  margin-top: 12px;
}
.ld-json textarea {
  width: 100%;
  box-sizing: border-box;
  font-size: 12px;
  font-family: Consolas, Menlo, monospace;
  white-space: pre;
}
.ld-status {
  font-size: 13px;
  color: #4b5563;
  word-break: break-all;
}
.ld-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  padding: 24px;
}
// 预览适配容器：img 模式占满舞台由内部 img 自适应；canvas 模式由 posterFitStyle 给出精确 px 尺寸
.ld-poster-fit {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ld-stage /deep/ .legacy-poster {
  width: 100%;
  height: 100%;
}
// img 也做 contain 等比缩放：宽高都不超出容器，避免滚动条
.ld-stage /deep/ .preview-img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
}
</style>
