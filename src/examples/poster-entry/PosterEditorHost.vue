<template>
  <div class="poster-editor-host">
    <!-- 交接信封读取失败提示：替代静默空画布（无 field/token 的直接访问为新建场景，不提示） -->
    <Alert v-if="handoffMissTip" type="warning" show-icon class="poster-editor-host__miss-tip">
      {{ handoffMissTip }}
    </Alert>
    <FabricEditor
      :adapters="adapters"
      :options="editorOptions"
      :remote-image-mode="remoteImageMode"
      @ready="onReady"
      @save-request="onSaveRequest"
    />
  </div>
</template>

<script>
import qs from 'qs';
import { Alert } from 'view-design';
import FabricEditor from '@/lib/FabricEditor.vue';
import { readHandoffRequest, writeHandoffResult, discardHandoff } from './handoff';

/**
 * 海报编辑器宿主薄壳（业务自建路由页用）
 *
 * 职责：
 * 1. ready 后按 query { field, token } 读取交接信封，加载待编辑 JSON；
 *    读不到时页面内提示（不静默空画布）：可能因同一海报重复打开被新会话覆盖，或保存后刷新了本页；
 * 2. 拦截 save-request，将最小化 JSON 回写信封，并解除 beforeunload 防丢守卫
 *    （HistoryPlugin.allowClose），保证后续关闭/跳转不触发浏览器确认框：
 *    - 由 window.open 打开（window.opener 存在）：解除守卫后静默关闭本标签页，
 *      原配置页经 storage 事件消费结果并应用；
 *    - 直接访问（无 opener）：回跳来源页（query 携带 applied=token）由容器消费；
 *      两者都没有（如直接粘 URL 打开且无 from）时结果无接收方，销毁信封避免 localStorage 残留。
 *
 * props 透传 FabricEditor 的 adapters / options（如 workspace 尺寸等）与 remoteImageMode。
 */
export default {
  name: 'PosterEditorHost',
  components: { Alert, FabricEditor },
  props: {
    adapters: { type: Object, default: () => ({}) },
    options: { type: Object, default: () => ({}) },
    // 强制远程图片模式：隐藏本地图片 Tab、禁止在线图转 base64，图片一律以远程 URL 入库
    remoteImageMode: { type: Boolean, default: false },
  },
  data() {
    return {
      // 非空时顶部显示交接信封读取失败提示条
      handoffMissTip: '',
    };
  },
  computed: {
    editorOptions() {
      // 宿主场景必然走 save-request 回传，默认展示顶栏保存按钮
      return { showSaveButton: true, ...this.options };
    },
  },
  methods: {
    onReady({ api, editor }) {
      // 记录 editor 引用：保存回传后调用 allowClose 解除 beforeunload 防丢守卫
      this._editor = editor;
      // 进页即预热变量表：不等点开变量弹窗。
      // 插件侧拉取非幂等（多人协同，每次调用都拉最新）：弹窗每次打开仍会重拉，此处仅提前首拉；
      // 未注入 variable adapter 时为无害空操作；失败静默（弹窗打开时 ensureSchemaLoaded 会自动重试）
      if (editor && editor.ensureSchemaLoaded) {
        editor
          .ensureSchemaLoaded()
          .catch((e) => console.warn('[PosterEditorHost] 变量表预加载失败', e));
      }
      const { field, token } = this.$route.query;
      if (!field || !token) return;
      const envelope = readHandoffRequest(field, token);
      if (!envelope || !envelope.json) {
        this.handoffMissTip =
          '未读取到待编辑的海报数据（已按空画布新建）：可能因同一海报重复打开被新会话覆盖，或保存后刷新了本页。详情见控制台 [poster-handoff] 日志';
        console.warn(
          `[poster-handoff] onReady 未获取到待编辑数据（信封=${
            envelope ? '有效但 json 为空' : '无效'
          }，原因见上方 [poster-handoff] read 日志）→ 空画布新建`
        );
        return; // 无待编辑数据 → 空画布新建
      }
      try {
        console.log(
          `[poster-handoff] onReady 加载信封 field=${field} token=${token} json.length=${envelope.json.length}`
        );
        api.loadJSON(JSON.parse(envelope.json));
      } catch (e) {
        this.$Message && this.$Message.error('待编辑 JSON 解析失败');
        console.error('[poster-handoff] onReady loadJSON 前解析失败', e);
      }
    },
    onSaveRequest({ json }) {
      const { field, token, from } = this.$route.query;
      if (!field || !token) return;
      if (!writeHandoffResult(field, token, JSON.stringify(json))) {
        this.$Message && this.$Message.error('保存回传失败（交接信封无效）');
        return;
      }
      // 已保存，解除 HistoryPlugin 的 beforeunload 防丢守卫：
      // 否则随后的脚本关闭会触发浏览器"离开此网站？"确认框
      if (this._editor && this._editor.allowClose) this._editor.allowClose();
      // 本页由 window.open 创建（auxiliary 窗口）且防丢守卫已解除，close 静默执行；
      // 结果由原页经 storage 事件消费（事件派发不依赖本页存活），随后即可关闭
      if (window.opener) {
        window.close();
        return;
      }
      // 直接访问（无 opener）的回退路径：跳转回来源页消费
      if (!from) {
        // 既无 opener 也无来源页：结果没有任何接收方，信封永远不会被消费 → 主动销毁
        discardHandoff(field, token);
        this.$Message && this.$Message.warning('未检测到来源页，编辑结果未应用');
        return;
      }
      // 回跳来源页：保留来源页原 query，追加 applied=token 供容器识别
      const qIndex = from.indexOf('?');
      const path = qIndex >= 0 ? from.slice(0, qIndex) : from;
      const sourceQuery = qIndex >= 0 ? qs.parse(from.slice(qIndex + 1)) : {};
      this.$router.replace({
        path,
        query: { ...sourceQuery, field, token, applied: token },
      });
    },
  },
};
</script>

<style lang="less" scoped>
.poster-editor-host {
  position: relative;
  height: 100%;

  // 交接信封读取失败提示：浮在编辑器顶部，不遮挡交互
  &__miss-tip {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    max-width: 70%;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  }
}
</style>
