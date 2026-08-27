<template>
  <div class="legacy-poster pos-r">
    <!-- img 模式：离屏渲染容器（canvas 1:1 渲染后导出图片）；canvas 模式：直接展示并等比缩放 -->
    <div
      class="legacy-render-host"
      :class="{ 'legacy-render-host--visible': effectiveCanvasMode }"
      :style="hostStyle"
    >
      <FabricRenderer
        v-if="json"
        ref="inner"
        :json="json"
        :data="data"
        :adapters="adapters"
        :options="rendererOptions"
        @ready="onInnerReady"
        @rendered="onInnerRendered"
        @renderer-error="onInnerRendererError"
        @error="onInnerError"
      />
    </div>

    <div v-if="errrorText" class="preview-error color-red">{{ errrorText }}</div>
    <div v-else-if="showLoading" class="legacy-poster-loading">
      <span class="legacy-poster-spinner" />
    </div>
    <img
      v-show="!effectiveCanvasMode && posterSrc && (!waitPreviewLoadMeta || metadataLoaded)"
      ref="img"
      class="preview-img full-width block pos-r"
      :class="[previewClassName, !posterSrc ? 'visibility-hidden' : '']"
      :src="posterSrc"
      crossOrigin="Anonymous"
      alt=""
      @load="emitLoad"
      @click="emitClick"
    />
  </div>
</template>

<script>
// 重依赖（渲染器 / fabric / 转换器 / 二维码生成器）全部异步加载，
// 保持本模块轻量、组件挂载后立即展示 spinner，避免移动端同步加载长白屏
// （旧版 fabric-poster.vue 对 fabric 也是同款做法：import('fabric') 单例懒加载）。
// 渲染器 lib 统一从 @/lib/renderer 获取（FabricRenderer / generateQrCodeDataURL 等）；
// legacyConverter 依赖 @/lib/renderer，两者共享同一 chunk，webpack 自动去重。
const loadConverter = () => import('./legacyConverter');
const loadRendererLib = () => import('@/lib/renderer');
import { enterPreviewFallback, isTaintedError } from './previewFallback';

// 判别是否为 FabricEditor 导出的标准 fabric JSON：
// 标准结构顶层含 objects[]（每个元素带 type）；旧 posterConfig 是
// background/backgroundColor/text[]/img[]/jsonList[] 等字段，无顶层 objects。
function isStandardPosterConfig(config) {
  if (!config) return false;
  let parsed = config;
  if (typeof config === 'string') {
    try {
      parsed = JSON.parse(config);
    } catch (e) {
      return false;
    }
  }
  return !!(parsed && Array.isArray(parsed.objects));
}

// scope → 可安全用于变量替换的数据（JSON round-trip 快照）：
// - 注意：function / undefined / Date 等会被 JSON 语义改写或丢弃（对变量替换无影响）
function snapshotScope(scope) {
  if (!scope || typeof scope !== 'object') return {};
  const seen = new WeakSet();
  return JSON.parse(
    JSON.stringify(scope, (key, value) => {
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    })
  );
}

export default {
  name: 'LegacyFabricRenderer',
  components: {
    // 异步组件：FabricRenderer chunk 按需加载（webpack 会与 mounted 里的预热调用去重）
    FabricRenderer: () => loadRendererLib().then((m) => m.FabricRenderer),
  },
  props: {
    // 后台保存的旧数据（background / avatarPosition / text[] / img[] / jsonList[] …）
    posterConfig: { type: Object, default: null },
    // 变量作用域（userName / nickname / stageName …，与旧 scope 语义一致）
    scope: { type: Object, default: () => ({}) },
    // 分享链接（字符串或函数），用于二维码内容
    shareUrl: { type: [String, Function], default: undefined },
    // 预生成二维码图片 dataURL（旧 shareCode；提供时直接作为图片，不走动态生成）
    shareCode: { type: String, default: '' },
    spinnerTheme: { type: String, default: '' },
    previewClassName: { type: String, default: '' },
    waitPreviewLoadMeta: { type: Boolean, default: false },
    // 展示模式：'img' 渲染后导出图片展示（默认）；'canvas' 直接展示 canvas（宽度 100%，按渲染尺寸动态 aspect-ratio 等比缩放）
    displayMode: {
      type: String,
      default: 'img',
      validator: (v) => ['img', 'canvas'].includes(v),
    },
    // 保留兼容：头像现在由 avatarLoader / scope.avatar 注入，不再需要登录接口
    needLogin: { type: Boolean, default: true },
    // 头像加载器：() => Promise<string>（URL 或 base64），默认取 scope.avatar
    avatarLoader: { type: Function, default: null },
    // 昵称字号：函数 (posterWidth) => px；默认 12 * calculateRatio(posterWidth)
    nicknameFontSize: { type: [Function, Number], default: null },
    // 导出倍率（与 ServersPlugin.preview 一致）
    previewMultiplier: { type: Number, default: 1 },
    // 透传给 FabricRenderer（字体 / 渲染器 options）
    adapters: { type: Object, default: () => ({}) },
    options: { type: Object, default: () => ({}) },
  },
  data() {
    return {
      json: null,
      data: {},
      metadataLoaded: false,
      posterSrc: '',
      error: null,
      renderSeq: 0,
      // canvas 模式：渲染完成后的画布比例（如 '750 / 1334'），用于 CSS aspect-ratio
      canvasRatio: null,
      canvasReady: false,
      // img 模式导出失败（画布被跨域图污染）标记：置位后自动按 canvas 直显
      exportFailed: false,
    };
  },
  computed: {
    errrorText() {
      const { error } = this;
      return typeof error === 'string' ? error : error && error.message;
    },
    isCanvasMode() {
      return this.displayMode === 'canvas';
    },
    // 生效展示模式：img 模式导出失败（画布被跨域图污染，toDataURL 恒抛 SecurityError）
    // 时自动回退为 canvas 直显（保显示、舍导出）；不重渲染、不改 props
    effectiveCanvasMode() {
      return this.isCanvasMode || this.exportFailed;
    },
    // canvas 模式下容器样式：宽度跟随 100%，高度按渲染完成后的画布比例等比计算
    hostStyle() {
      return this.effectiveCanvasMode && this.canvasRatio
        ? { aspectRatio: this.canvasRatio }
        : null;
    },
    showLoading() {
      return this.effectiveCanvasMode ? !this.canvasReady : !this.posterSrc;
    },
    rendererOptions() {
      return { ...this.options };
    },
  },
  watch: {
    posterConfig: {
      handler() {
        this.updateCanvas();
      },
      deep: true,
    },
  },
  mounted() {
    // 预热渲染器 lib chunk：与其余重依赖（legacyConverter 等）并行加载
    loadRendererLib();
    this.updateCanvas();
  },
  methods: {
    // 头像：avatarLoader 优先，回退 scope.avatar
    async resolveAvatar() {
      if (typeof this.avatarLoader === 'function') {
        try {
          const v = await this.avatarLoader();
          return v || '';
        } catch (e) {
          console.warn('[LegacyFabricRenderer] avatarLoader 失败：', e && e.message);
          return '';
        }
      }
      return (this.scope && this.scope.avatar) || '';
    },
    // 分享链接：shareUrl（函数/字符串），缺省 location.href
    resolveShareUrl() {
      const url =
        this.shareUrl === undefined
          ? typeof location !== 'undefined'
            ? location.href
            : ''
          : this.shareUrl;
      if (typeof url === 'function') {
        try {
          return Promise.resolve(url());
        } catch (e) {
          return Promise.resolve('');
        }
      }
      return Promise.resolve(url || '');
    },
    // 二维码图片（旧 scope.$posterQrcode 语义：永远是二维码图片，jsonList 内 {$posterQrcode} 引用）：
    // shareCode 优先；否则仅当 jsonList 引用 {$posterQrcode} 时按 shareUrl 现生成（复刻旧 getShareCode），
    // qrCodePosition 动态二维码走渲染器 QrCodePlugin（内容 $posterShareUrl），无需预生成
    async resolvePosterQrImage(shareUrl) {
      if (this.shareCode) return this.shareCode;
      const jsonList = (this.posterConfig && this.posterConfig.jsonList) || [];
      if (!shareUrl || JSON.stringify(jsonList).indexOf('$posterQrcode') === -1) return '';
      try {
        const [{ QR_DEFAULTS }, { generateQrCodeDataURL }] = await Promise.all([
          loadConverter(),
          loadRendererLib(),
        ]);
        return await generateQrCodeDataURL({ ...QR_DEFAULTS, data: shareUrl });
      } catch (e) {
        console.warn('[LegacyFabricRenderer] 二维码生成失败：', e && e.message);
        return '';
      }
    },
    async updateCanvas() {
      const seq = ++this.renderSeq;
      this.error = null;
      if (!this.posterConfig) return;
      try {
        const converter = await loadConverter();
        if (seq !== this.renderSeq) return;
        const data = snapshotScope(this.scope);
        const avatar = await this.resolveAvatar();
        if (avatar) data.avatar = avatar;
        const shareUrl = await this.resolveShareUrl();
        if (shareUrl) data.$posterShareUrl = shareUrl;
        const posterQrImage = await this.resolvePosterQrImage(shareUrl);
        if (posterQrImage) data.$posterQrcode = posterQrImage;
        if (seq !== this.renderSeq) return;

        // 标准 fabric JSON（FabricEditor 导出）：直接透传渲染，
        // 变量（{{avatar}} / {{$posterQrcode}} …）由 FabricRenderer 的 renderObjects 按 data 替换；
        // 旧数据：仍走 convertLegacyPoster 归一化。
        if (isStandardPosterConfig(this.posterConfig)) {
          let json =
            typeof this.posterConfig === 'string'
              ? JSON.parse(this.posterConfig)
              : this.posterConfig;
          // 深拷贝后归一化：避免原地修改触发 posterConfig deep watcher 循环（并污染共享配置）。
          // 渲染器未注册旧自定义 ellipsis-textbox（fromObject 报错），且其覆写的 Textbox.fromObject
          // 不 enliven clipPath（渲染期 shouldCache 报错）；归一化把旧类型映射为渲染器契约，不改变渲染语义。
          json = converter.normalizeStandardJson(JSON.parse(JSON.stringify(json)));
          // 标准 JSON 已自带二维码参数与字号，shareCode/昵称字号仅对旧数据生效，此处忽略
          if (seq !== this.renderSeq) return;
          this.data = data;
          this.json = json;
          this.$emit('update', json);
          return;
        }

        const nicknameFontSize =
          typeof this.nicknameFontSize === 'function'
            ? this.nicknameFontSize
            : this.nicknameFontSize != null
            ? () => this.nicknameFontSize
            : undefined;
        const json = await converter.convertLegacyPoster(this.posterConfig, {
          data,
          nicknameFontSize,
          qrImage: this.shareCode || '',
          // 「按接入域名分片缓存」配置：默认 feDomain=location.hostname，false 关闭，{ param, getValue } 自定义
          cacheBust: this.options && this.options.cacheBust,
        });
        if (seq !== this.renderSeq) return;
        this.data = data;
        this.json = json;
        this.$emit('update', json);
      } catch (e) {
        if (seq === this.renderSeq) this.emitError(e);
      }
    },
    onInnerReady(payload) {
      this.$emit('ready', payload);
    },
    async onInnerRendered({ core, canvas }) {
      const seq = this.renderSeq;
      try {
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        // canvas 模式：记录 autoGrow 等处理后的最终画布尺寸，供 CSS aspect-ratio 等比缩放
        if (this.isCanvasMode && w > 0 && h > 0) {
          this.canvasRatio = `${w} / ${h}`;
          this.canvasReady = true;
        }
        // canvas 模式直接展示画布，无需导出预览图片；附带画布尺寸供宿主做容器适配
        if (this.isCanvasMode) {
          this.$emit('render', null, { width: w, height: h });
          return;
        }
        const servers = core.getPlugin('ServersPlugin');
        if (servers && typeof servers.preview === 'function') {
          const posterSrc = await servers.preview(this.previewMultiplier || 1);
          if (seq !== this.renderSeq) return;
          if (!posterSrc) {
            // 导出失败（画布被跨域图污染 → toDataURL 抛 SecurityError，preview 兜底 resolve null）：
            // img 展示拿不到图会永转 spinner，自动回退 canvas 直显（保显示、舍导出）
            this.enterPreviewFallback(w, h, core, 'preview_null');
            return;
          }
          this.posterSrc = posterSrc;
          this.$nextTick(() => {
            this.metadataLoaded = false;
            this.$emit('render', posterSrc);
          });
        }
      } catch (e) {
        if (seq === this.renderSeq) this.emitError(e);
      }
    },
    // 导出失败 → canvas 直显回退：语义内核见 ./previewFallback.js
    enterPreviewFallback(w, h, core, reason) {
      const { state, emits } = enterPreviewFallback(
        {
          exportFailed: this.exportFailed,
          canvasRatio: this.canvasRatio,
          canvasReady: this.canvasReady,
        },
        { w, h, core, reason }
      );
      Object.assign(this, state);
      emits.forEach(({ name, args }) => this.$emit(name, ...args));
    },
    // 内层 FabricRenderer 转发的 renderer-error（save:error → CANVAS_TAINTED 等）：
    // 画布污染在引导期（preview 未跑完/被中断）也发生了，TAINTED 即回退 canvas 直显
    onInnerRendererError(payload) {
      if (isTaintedError(payload && payload.code) && !this.isCanvasMode) {
        this.enterPreviewFallback(0, 0, null, 'renderer_error');
        return;
      }
      // eslint-disable-next-line no-console
      console.warn('[LegacyFabricRenderer] renderer-error：', payload);
    },
    onInnerError(e) {
      this.emitError(e);
    },
    emitClick(e) {
      this.$emit('img-click', e);
    },
    emitLoad(e) {
      if (!this.metadataLoaded) this.emitLoadedmetadata();
      this.$emit('img-load', e);
    },
    emitLoadedmetadata() {
      this.metadataLoaded = true;
      this.$emit('img-load-meta', this.$refs.img);
    },
    emitError(e) {
      this.error = e;
      this.$emit('error', e);
    },
  },
};
</script>

<style lang="less" scoped>
// 离屏渲染容器：canvas 保持实际像素 1:1，不参与布局
.legacy-render-host {
  position: absolute;
  top: -9999px;
  left: -9999px;
  width: 10px;
  height: 10px;
  overflow: hidden;
}
// canvas 展示模式：宽度 100%，高度由 aspect-ratio（hostStyle）按渲染尺寸等比计算，行为与 img 的 height:auto 一致
.legacy-render-host--visible {
  position: static;
  top: auto;
  left: auto;
  width: 100%;
  height: auto;
  overflow: visible;
  // fabric 会给 .canvas-container 与内部 canvas 写入内联像素宽高，需覆盖以跟随容器缩放
  /deep/ .canvas-container,
  /deep/ .canvas-container canvas {
    width: 100% !important;
    height: 100% !important;
  }
}
.legacy-poster-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
.legacy-poster-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e5e6eb;
  border-top-color: #4c6ef5;
  border-radius: 50%;
  animation: legacy-poster-spin 0.8s linear infinite;
}
@keyframes legacy-poster-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
