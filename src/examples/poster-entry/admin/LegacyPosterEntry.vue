<template>
  <PosterEntryStage
    :value="valueStr"
    :field="field"
    :is-configured="hasPosterConfig"
    :resolve-preview="resolvePreview"
    :validate="validate"
    :preview-error="convertError"
    :preview-warning="convertWarning"
    :adapters="adapters"
    :sample-data="effectiveSampleData"
    :pure-sample-data="pureSampleData"
    :preview-height="previewHeight"
    :readonly="readonly"
    :deletable="deletable"
    :download-name="downloadName"
    @input="onInput"
    @edit-page="openEditor"
  />
</template>

<script>
import { computed, ref, watch, onBeforeUnmount } from '@vue/composition-api';
import { Message, Modal } from 'view-design';
import PosterEntryStage from '../PosterEntryStage.vue';
import { parsePosterJson } from '../usePosterEntry';
import { openHandoff, consumeHandoffResult, HANDOFF_PREFIX } from '../handoff';
import { createVariableSchemaAdapter } from './variableSchemaAdapter';
import {
  hasPosterConfig,
  isLegacyPosterConfig,
  convertLegacyToStandard,
  deriveFallbackSampleData,
} from './legacyPosterUtils';

/**
 * 旧版海报字段入口（运营后台用，兼容 marketConfig.courseXxxPosterConfig 旧格式）
 *
 * 用法（替换 custom-attribute-control-list 一类的逐输入框配置）：
 *   <LegacyPosterEntry
 *     :value="data.marketConfig.courseSharePosterConfig"  // 旧格式对象/JSON 字符串，或标准 fabric JSON
 *     :field="{ key: 'courseSharePosterConfig', title: '讨论区分享海报' }"
 *     :sample-data="sampleData"      // 变量示例值（预览渲染用：nickname / bookshelfImage / avatar …）
 *                                    // 未提供的文本变量自动以 `{key}` 占位兜底；图片变量无例值时
 *                                    // 以默认纯色图兜底（派生源为转换后的标准 JSON）
 *     :scope-keys="scopeKeys"        // 可选；已知变量名列表。不传则自动从旧数据扫描变量引用兜底
 *     :adapters="adapters"
 *     :variable-context="variableKeys"  // 可选；变量表存储键 { pagePath, keyStr }（拼接规则由
 *                                       // 业务侧登记，posterName 取 field.key）。经交接 query
 *                                       // category/fieldId 传编辑器页，并驱动卡片预览示例值拉取
 *                                       // （后台变量表 example 覆盖内嵌快照）
 *     editor-route="/poster-editor"  // 可选；提供则内置编辑器跳转与结果回传
 *     @input="v => (data.marketConfig.courseSharePosterConfig = v)"
 *   />
 *
 * 兼容语义：
 * - 值兼容：旧格式（background/text[]/img[]/jsonList…）与标准 fabric JSON 均可；
 *   输入对象时出参也为对象（空值统一 ''），输入字符串时出参为字符串。
 * - 预览：旧格式异步转换为标准 JSON 后渲染（变量图/文本变量由 sampleData 注入示例值），
 *   头像/变量图在渲染完成后按旧版语义布局（圆形裁切/拉伸到配置框）。
 * - 弹窗回显/复制：转换后的标准 JSON（文本与图片变量保留，可直接进编辑器）。
 * - 应用：保存弹窗确认的标准 JSON（存量旧配置在首次编辑后懒升级，变量语义不丢失）。
 * - 编辑器：跳转前自动转换为标准 JSON 交接；编辑器保存回传后应用。
 */
export default {
  name: 'LegacyPosterEntry',
  components: { PosterEntryStage },
  props: {
    // 海报配置：旧格式对象/JSON 字符串，或标准 fabric JSON 字符串
    value: { type: [Object, String], default: '' },
    // 字段定义：{ key, title, description? }（key 同时用作编辑器交接信封键）
    field: { type: Object, required: true },
    // 变量示例数据（预览渲染用）。未提供的文本变量自动以 `{key}` 占位兜底；图片变量无例值时
    // 以默认纯色图兜底（旧格式与标准 fabric JSON 均可推算，旧格式经转换后派生）
    sampleData: { type: Object, default: () => ({}) },
    // 预览数据严格按业务 sampleData 渲染：不做 {key} 占位与变量表/内嵌快照 example 兜底
    // （不拉后台变量表），并隐藏示例/原样切换（证书下发等纯用户数据场景）
    pureSampleData: { type: Boolean, default: false },
    // 已知变量名列表（旧格式转换时保留 {{key}} 变量；如 variableDescription 的 name 集合）。
    // 不传时自动从旧数据扫描变量引用兜底（见 extractLegacyVarKeys）；传则完全手动控制。
    scopeKeys: { type: Array, default: () => [] },
    adapters: { type: Object, default: () => ({}) },
    // 变量表存储键（业务侧拼好 { pagePath, keyStr }）：
    // openEditor 时以 query { category: pagePath, fieldId: keyStr } 透传给编辑器页
    // （editor 页读取后注入变量表存储适配器）；同时驱动卡片预览示例值拉取
    // （后台变量表 example 覆盖内嵌快照，见 remoteSchemaDefs）；不传则不落库、预览退本地推导
    variableContext: { type: Object, default: () => ({}) },
    // 图片加载失败（如跨域）二级警告文案；支持 {count} 占位符；空则用内置默认文案
    imageLoadWarning: { type: String, default: '' },
    // 编辑器页路由路径；不传则 edit-page 事件外抛（由业务自行 window.open）
    editorRoute: { type: String, default: '/poster-editor-demo' },
    previewHeight: { type: Number, default: 260 },
    // 只读预览：隐藏标签与配置/删除等编辑入口，仅可查看
    readonly: { type: Boolean, default: false },
    // 是否提供「删除」入口（透传 Stage/Modal；如单海报业务不允许清空配置）
    deletable: { type: Boolean, default: true },
    // 只读下载文件名（不含扩展名）；缺省用 field.title
    downloadName: { type: String, default: '' },
  },
  setup(props, { emit, root }) {
    // 统一为 JSON 字符串供 Stage 消费（对象入参出参对称，见 onInput）
    const valueStr = computed(() => {
      if (!props.value) return '';
      return typeof props.value === 'string' ? props.value : JSON.stringify(props.value);
    });

    const DEFAULT_IMAGE_LOAD_WARNING =
      '部分图片加载失败（{count} 处，可能因当前域名不在 CDN 白名单），预览可能不完整，且尺寸可能识别错误';
    // 二级警告：非致命丢图（如跨域加载失败被跳过），预览仍渲染
    const convertWarning = ref('');

    // 旧格式 → 标准 JSON（按值缓存：转换含背景/素材测量加载，成本高；失败原因随结果缓存）
    const cache = new Map(); // key -> { json, error, warning }
    // 最近一次预览派生的失败信息（渲染到 UI；成功派生时清空）
    const convertError = ref('');
    const toStandard = async (v, opts = {}) => {
      if (!v) {
        convertError.value = '';
        convertWarning.value = '';
        return null;
      }
      const key =
        (typeof v === 'string' ? v : JSON.stringify(v)) + (opts.forEditor ? '|editor' : '');
      if (!cache.has(key)) {
        let json = null;
        let error = '';
        let loadFailCount = 0;
        try {
          const str = await convertLegacyToStandard(v, {
            scopeKeys: props.scopeKeys,
            ...opts,
            onWarn: () => {
              loadFailCount += 1;
            },
          });
          json = str ? JSON.parse(str) : null;
        } catch (e) {
          console.warn('[LegacyPosterEntry] 转换失败', e);
          error = (e && e.message) || '旧版海报配置转换失败';
        }
        if (!json && !error) error = '旧版海报配置转换失败';
        const warning =
          json && loadFailCount
            ? (props.imageLoadWarning || DEFAULT_IMAGE_LOAD_WARNING).replace(
                '{count}',
                String(loadFailCount)
              )
            : '';
        // 带警告（丢图）或失败的结果不入缓存：回退成功条件（如 CORS 回退包装安装、
        // 网络恢复）出现后重转可得到完整结果；仅健康结果永久缓存
        if (json && !warning) cache.set(key, { json, error, warning });
      }
      const hit = cache.get(key);
      convertError.value = hit.json ? '' : hit.error;
      convertWarning.value = hit.json ? hit.warning : '';
      return hit.json;
    };

    // 后台变量表定义（adapters.variable list 产物）：预览示例值以后台为权威（多人协同）。
    // 有存储键时进卡即拉一次（每卡 1 个请求）；失败/无存储键静默降级为本地推导
    // （内嵌快照 > `{key}` 占位）；拉到后经 PosterPreview 的 data watch 触发预览重绘
    const remoteSchemaDefs = ref([]);
    const ctx = props.variableContext || {};
    if (ctx.pagePath && ctx.keyStr && !props.pureSampleData) {
      let disposed = false;
      onBeforeUnmount(() => {
        disposed = true;
      });
      createVariableSchemaAdapter({ pagePath: ctx.pagePath, keyStr: ctx.keyStr })
        .list()
        .then((defs) => {
          if (!disposed) remoteSchemaDefs.value = Array.isArray(defs) ? defs : [];
        })
        .catch((e) => console.warn('[LegacyPosterEntry] 变量表拉取失败，预览退本地推导', e));
    }

    // 示例数据合并（按 key，外部优先）：业务 sampleData > 后台变量表例值 >
    // value 内嵌 variableMeta.schema 例值 > `{key}`/默认纯色图（后三层在 derive 内合并）。
    // 派生源统一为标准 JSON：标准值直接用；旧格式先经 toStandard 转换（旧数据的变量来自
    // avatarPosition/nickNamePosition 等定位字段，仅"转换后"才可见 {{key}}，直接扫原始值
    // 会漏掉这些变量 → 示例模式缺图/缺占位）
    const derivedFallback = ref({});
    let derivedSeq = 0;
    const refreshDerivedFallback = async () => {
      const seq = ++derivedSeq;
      const v = props.value;
      if (props.pureSampleData || !v) {
        derivedFallback.value = {};
        return;
      }
      let source = null;
      if (typeof v === 'string') {
        try {
          const parsed = JSON.parse(v);
          if (parsed && Array.isArray(parsed.objects)) source = parsed;
        } catch (e) {
          // 非 JSON 字符串按旧格式处理
        }
      } else if (v && Array.isArray(v.objects)) {
        source = v;
      }
      if (!source) {
        source = await toStandard(valueStr.value);
        if (seq !== derivedSeq) return;
      }
      derivedFallback.value =
        source && Array.isArray(source.objects)
          ? deriveFallbackSampleData(source, remoteSchemaDefs.value)
          : {};
    };
    watch([() => props.value, remoteSchemaDefs], refreshDerivedFallback, { immediate: true });

    const effectiveSampleData = computed(() => {
      // 纯用户数据场景：跳过兜底派生（{key} 占位 / 变量表与内嵌快照例值一律不注入）
      if (props.pureSampleData) return props.sampleData;
      const derived = derivedFallback.value;
      if (!derived || !Object.keys(derived).length) return props.sampleData;
      return { ...derived, ...props.sampleData };
    });

    // 预览渲染数据：标准格式直接用；旧格式转换（data 不传值 → 变量语义保留，预览由 sampleData 注入）
    const resolvePreview = async (v, parsed) => {
      if (parsed && Array.isArray(parsed.objects)) return parsed;
      return toStandard(v);
    };

    // 弹窗输入校验：标准 JSON 走通用校验（含期望尺寸）；旧格式转换后作为应用值（懒升级）
    const validate = async (text) => {
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: 'JSON 格式不正确' };
      }
      if (obj && Array.isArray(obj.objects)) {
        return parsePosterJson(text, props.field, null);
      }
      if (!obj || typeof obj !== 'object' || !isLegacyPosterConfig(obj)) {
        return { ok: false, error: '无法识别的海报数据格式（需标准 objects 或旧版 posterConfig）' };
      }
      const json = await toStandard(obj);
      if (!json) return { ok: false, error: convertError.value || '旧版海报配置转换失败' };
      return { ok: true, json, preview: json };
    };

    // 组装编辑器页 query：交接参数 + 来源页回跳 + 变量表存储键（业务侧拼好的 pagePath/keyStr，
    // query 契约用 category/fieldId 承载；缺省不带，编辑器页变量表降级为会话内编辑）
    const buildEditorQuery = (q, route) => {
      const query = { ...q, from: route.fullPath || '' };
      const { pagePath, keyStr } = props.variableContext || {};
      if (pagePath) query.category = pagePath;
      if (keyStr) query.fieldId = keyStr;
      return query;
    };

    // 值变更：对象入参 → 解析回对象（空值统一 ''），保持出入参类型对称
    const onInput = (v) => {
      if (!v) {
        emit('input', '');
        return;
      }
      if (typeof props.value !== 'string') {
        try {
          emit('input', JSON.parse(v));
          return;
        } catch (e) {
          // 解析失败（不应发生）则原样回传字符串
        }
      }
      emit('input', v);
    };

    // 编辑器交接：跳转前把当前配置转换为标准 JSON 写入信封（forEditor 剥离渲染锁，
    // 旧转换器输出全部对象 selectable:false，不剥则编辑器里全部图层锁定无法编辑）
    const openEditor = async () => {
      if (props.readonly) return;
      if (!props.editorRoute) {
        emit('edit-page');
        return;
      }
      console.log(
        `[poster-handoff] openEditor 进入 field=${props.field.key} value.length=${
          valueStr.value ? valueStr.value.length : 0
        }`
      );
      const standard = await toStandard(valueStr.value, { forEditor: true });
      if (!standard) {
        console.warn(
          `[poster-handoff] openEditor 转换失败 standard=null（error=${
            convertError.value || '无'
          }）→ 以空 json 交接（编辑器将空白画布）`
        );
      }
      let q;
      try {
        q = openHandoff(props.field.key, standard ? JSON.stringify(standard) : '');
      } catch (e) {
        // 写入失败（多为本地存储配额不足）：提示并中止，避免打开一个读不到数据的编辑器页
        console.warn('[poster-handoff] openHandoff 写入失败', e);
        Message.error((e && e.message) || '打开编辑器失败');
        return;
      }
      // 记录挂起 token，供 storage 事件匹配消费（只允许打开者消费自己的信封）
      pendingToken = q.token;
      const router = root.$router;
      const route = root.$route || {};
      const href = router
        ? router.resolve({
            path: props.editorRoute,
            query: buildEditorQuery(q, route),
          }).href
        : `${props.editorRoute}?field=${q.field}&token=${q.token}`;
      window.open(href, '_blank');
    };

    // 挂起的交接 token（非响应式）
    let pendingToken = null;
    const applyHandoffJson = (json) => {
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
      onInput(json);
      Message.success(`「${props.field.title}」已应用`);
    };
    const onStorage = (e) => {
      if (!e.key || e.key.indexOf(HANDOFF_PREFIX) !== 0) return;
      const fieldKey = e.key.slice(HANDOFF_PREFIX.length);
      if (fieldKey !== props.field.key || !pendingToken) return;
      // token 预检：其他标签页对本信封键的任何变更（新会话 openHandoff 覆盖 / 删除）都会触发本事件；
      // 只认本页 pendingToken 的保存回传，避免拿旧 token 去消费（历史 bug：旧会话误删新会话的信封）
      let envelopeToken = null;
      try {
        envelopeToken = (JSON.parse(e.newValue || 'null') || {}).token || null;
      } catch (err) {
        envelopeToken = null;
      }
      if (envelopeToken !== pendingToken) {
        console.warn(
          `[poster-handoff] onStorage 忽略（token 不匹配）：本页 pendingToken=${pendingToken}，事件信封 token=${
            envelopeToken || '(空)'
          }`
        );
        return;
      }
      const json = consumeHandoffResult(fieldKey, pendingToken);
      if (!json) return;
      pendingToken = null;
      // 用户在编辑器里显式点了保存，这里直接应用
      applyHandoffJson(json);
    };
    window.addEventListener('storage', onStorage);
    onBeforeUnmount(() => window.removeEventListener('storage', onStorage));

    // 回退路径：编辑器页无 opener（如直接粘 URL 打开）保存后回跳本页，query 携带 applied=token。
    // 该路径不是当前页的直接操作，二次确认后才覆盖现有配置（与 PosterEntries 回退语义一致）。
    // 缺失这条消费时，回跳写下的结果信封永远无人取，是 localStorage 残留的主要来源之一。
    const cleanQuery = () => {
      const query = { ...((root.$route && root.$route.query) || {}) };
      delete query.field;
      delete query.token;
      delete query.applied;
      delete query.from;
      if (root.$router) root.$router.replace({ query }).catch(() => {});
    };
    watch(
      () => (root.$route && root.$route.query) || {},
      (query) => {
        const { field, token, applied } = query;
        if (!applied || !field || !token || applied !== token) return;
        if (field !== props.field.key) return; // 同页多卡片：只由对应字段的入口消费
        console.log(`[poster-handoff] 回退路径消费 field=${field} token=${token}`);
        const json = consumeHandoffResult(field, token);
        cleanQuery();
        if (!json) {
          Message.warning('编辑结果已失效，请重新编辑');
          return;
        }
        Modal.confirm({
          title: '检测到编辑结果',
          content: `是否将「${props.field.title}」的编辑结果应用到当前配置？`,
          onOk: () => applyHandoffJson(json),
        });
      },
      { immediate: true }
    );

    return {
      hasPosterConfig,
      valueStr,
      convertError,
      convertWarning,
      effectiveSampleData,
      resolvePreview,
      validate,
      onInput,
      openEditor,
    };
  },
};
</script>
