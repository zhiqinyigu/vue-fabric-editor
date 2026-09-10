<template>
  <Row :gutter="16" class="poster-entries">
    <Col v-for="f in fields" :key="f.key" :span="span">
      <PosterEntryCardHover
        :value="valueMap[f.key] || ''"
        :field="f"
        :adapters="adapters"
        :sample-data="sampleData"
        :transform="transform"
        @input="(v) => onChange(f.key, v)"
        @edit-page="openEditor(f)"
      />
    </Col>
  </Row>
</template>

<script>
import { Row, Col, Message, Modal } from 'view-design';
import PosterEntryCardHover from './PosterEntryCardHover.vue';
import { HANDOFF_PREFIX, openHandoff, consumeHandoffResult } from './handoff';

/**
 * 多海报字段入口容器（业务后台用）
 *
 * 用法：
 *   <PosterEntries
 *     v-model="posterMap"            // { [fieldKey]: jsonString }
 *     :fields="fields"               // [{ key, title, description, required, expectedSize }]
 *     :adapters="adapters"           // FabricRenderer 字体适配器
 *     :sample-data="sampleData"      // 变量示例数据
 *     :transform="transform"         // 可选：JSON 校验后的转换钩子（如 normalizeLegacyObject）
 *     editor-route="/poster-editor"  // 编辑器页路由路径
 *   />
 *
 * 卡片交互（悬停浮层）：
 * - 已配置：hover 显示「查看」（→ 查看/配置双模式弹窗）
 * - 未配置：空态引导「配置海报」
 *
 * 编辑器交接：
 * - 「打开编辑器」window.open 新标签页打开编辑器页（信封写入 localStorage）；
 * - 编辑器保存后解除防丢守卫并静默关闭本标签页；
 * - 本容器通过 storage 事件（token 匹配的挂起信封）消费结果并直接应用，
 *   用户全程停留在当前页面；
 * - 回退路径：编辑器页被直接访问（无 opener）保存时回跳本页（query 带 applied=token），
 *   由 $route.query watcher 消费（二次确认后应用）。
 */
export default {
  name: 'PosterEntries',
  components: { Row, Col, PosterEntryCardHover },
  props: {
    value: { type: Object, default: () => ({}) },
    fields: { type: Array, required: true },
    adapters: { type: Object, default: () => ({}) },
    sampleData: { type: Object, default: () => ({}) },
    transform: { type: Function, default: null },
    editorRoute: { type: String, required: true },
  },
  computed: {
    valueMap() {
      return this.value || {};
    },
    span() {
      return this.fields.length >= 4 ? 6 : this.fields.length === 3 ? 8 : 12;
    },
  },
  watch: {
    // 回退路径：编辑器页直接访问（无 opener）保存后回跳（query 带 applied=token）
    '$route.query': {
      handler() {
        this.checkHandoffResult();
      },
      immediate: true,
    },
  },
  created() {
    // 挂起的交接信封：{ [fieldKey]: token }，非响应式即可
    this._pendingHandoffs = {};
    // 主路径：编辑器标签页保存后写信封，本页经 storage 事件消费（storage 只在其他标签页触发）
    this._onStorage = (e) => this.onStorage(e);
    window.addEventListener('storage', this._onStorage);
  },
  beforeDestroy() {
    window.removeEventListener('storage', this._onStorage);
  },
  methods: {
    onChange(key, v) {
      this.$emit('input', { ...this.valueMap, [key]: v });
    },
    openEditor(field) {
      let q;
      try {
        q = openHandoff(field.key, this.valueMap[field.key] || '');
      } catch (e) {
        // 写入失败（多为本地存储配额不足）：提示并中止，避免打开一个读不到数据的编辑器页
        Message.error((e && e.message) || '打开编辑器失败');
        return;
      }
      // 记录挂起 token，供 storage 事件匹配消费（只允许打开者消费自己的信封）
      this._pendingHandoffs[field.key] = q.token;
      const { href } = this.$router.resolve({
        path: this.editorRoute,
        query: { ...q, from: this.$route.fullPath },
      });
      // 新标签页打开编辑器（信封用 localStorage，跨标签页可读）
      window.open(href, '_blank');
    },
    onStorage(e) {
      if (!e.key || e.key.indexOf(HANDOFF_PREFIX) !== 0) return;
      const fieldKey = e.key.slice(HANDOFF_PREFIX.length);
      const token = this._pendingHandoffs[fieldKey];
      if (!token) return;
      const json = consumeHandoffResult(fieldKey, token);
      if (!json) return;
      delete this._pendingHandoffs[fieldKey];
      // 用户在编辑器里显式点了保存，这里直接应用（校验失败会有错误提示）
      this.applyHandoffJson(fieldKey, json);
    },
    checkHandoffResult() {
      const { field, token, applied } = this.$route.query;
      if (!applied || !field || !token || applied !== token) return;

      const json = consumeHandoffResult(field, token);
      this.cleanQuery();
      if (!json) {
        Message.warning('编辑结果已失效，请重新编辑');
        return;
      }
      const target = this.fields.find((f) => f.key === field);
      const title = target ? target.title : field;
      // 回退路径非用户当前页的直接操作，二次确认后才覆盖现有配置
      Modal.confirm({
        title: '检测到编辑结果',
        content: `是否将「${title}」的编辑结果应用到当前配置？`,
        onOk: () => {
          this.applyHandoffJson(field, json);
        },
      });
    },
    // 校验并应用编辑结果（storage 主路径与回跳回退路径共用）
    applyHandoffJson(fieldKey, json) {
      const target = this.fields.find((f) => f.key === fieldKey);
      let parsed;
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        Message.error('编辑结果 JSON 解析失败');
        return;
      }
      if (!parsed || !Array.isArray(parsed.objects) || !parsed.objects.length) {
        Message.error('编辑结果缺少画布数据，未应用');
        return;
      }
      this.onChange(fieldKey, json);
      Message.success(`「${target ? target.title : fieldKey}」已应用`);
    },
    cleanQuery() {
      const query = { ...this.$route.query };
      delete query.field;
      delete query.token;
      delete query.applied;
      // from 由编辑器页消费，正常不会残留；一并清理
      delete query.from;
      this.$router.replace({ query }).catch(() => {});
    },
  },
};
</script>
