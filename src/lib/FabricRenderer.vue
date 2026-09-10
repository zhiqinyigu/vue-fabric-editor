<!--
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 渲染器 Vue 组件外壳（只读画布渲染）
-->

<template>
  <div class="fabric-renderer">
    <canvas :id="canvasId" class="fabric-renderer-canvas" />
  </div>
</template>

<script>
import { onMounted, onBeforeUnmount, watch, getCurrentInstance } from '@vue/composition-api';
import { fabric } from 'fabric';
import RendererCore from '@/core/RendererCore';
import { renderObjects, DEFAULT_DELIMITER } from '@/core/variableEngine';
import { layoutVariableImages } from '@/core/variableImageFit';
import { installImageRenderGuard } from '@/core/patchImageRender';
import { applySchemaDefaults, resolveRenderSchema } from '@/core/variableSchema';

export default {
  name: 'FabricRenderer',
  props: {
    // 海报 JSON（编辑器 getJson / exportFile 输出）
    json: { type: [Object, String], default: null },
    // 变量渲染数据（点路径取值，如 { user: { name: '张三' } }）
    data: { type: Object, default: () => ({}) },
    // 变量表（可选注入）：defaultValue 缺失回退（渲染容错，不中断渲染）；
    // 未注入时回读模板自带 variableMeta.schema（完整/精简导出均携带），
    // 显式注入的 schema prop 完全优先（不 merge）
    schema: { type: Array, default: null },
    // 与编辑器同契约：{ font: { list: () => [{ name, file, type, img }] } }
    adapters: { type: Object, default: () => ({}) },
    options: { type: Object, default: () => ({}) },
  },
  setup(props, { emit }) {
    // 0 尺寸图片元素跳过绘制，避免单张坏图（未完成加载/加载失败）拖垮整画布
    installImageRenderGuard();
    const instance = getCurrentInstance();
    const uid = (instance && instance.uid) || Math.random().toString(36).slice(2, 8);
    const canvasId = `fe-render-${uid}`;
    let core = null;
    let canvas = null;
    let renderSeq = 0;

    const parseJson = (json) => {
      if (typeof json === 'string') {
        return json ? JSON.parse(json) : null;
      }
      return json || null;
    };

    // 模板模式（原样展示）：不做变量替换，直接渲染模板 JSON——与编辑器画布同源，
    // 未解析变量由对象层占位补丁自然呈现（图片占位/文本字面量/变量背景占位）。
    // 数据模式（示例/C 端）：替换后交给渲染器原生语义（缺值元素被丢弃）。
    // 兼容旧 option 名 variablePlaceholder（等价于 templateMode）。
    const isTemplateMode = () =>
      props.options.templateMode === true || props.options.variablePlaceholder === true;

    const render = async () => {
      if (!core || !props.json) return;
      const seq = ++renderSeq;
      try {
        const raw = parseJson(props.json);
        const delimiter =
          (raw && raw.variableMeta && raw.variableMeta.delimiter) ||
          props.options.delimiter ||
          DEFAULT_DELIMITER;
        let loadJson;
        if (isTemplateMode()) {
          // 原样：不注入任何数据（token 原样保留）
          loadJson = raw;
        } else {
          // 0) 变量表（可选注入）：defaultValue 缺失回退；未注入时回读模板自带快照
          const schema = resolveRenderSchema(
            raw,
            props.schema,
            props.options && props.options.schema
          );
          let renderData = props.data || {};
          if (schema) {
            renderData = applySchemaDefaults(renderData, schema);
          }
          // 1) 变量替换（深拷贝，不污染传入 JSON）
          loadJson = renderObjects(raw, renderData, delimiter);
        }
        // 2) 加载：manifest 展开 / 缺省字段补回 / 二维码·条形码参数还原 / 字体加载
        //    hookImportAfter 由 RendererWorkspacePlugin 自动执行（workspace 呈现 + 设计态基准）
        await core.loadJSON(loadJson);
        if (seq !== renderSeq) return; // 已有更新的渲染请求，丢弃本次结果
        // 3) autoGrow 增高（与编辑器预览同规则）
        const autoGrow = core.getPlugin('RendererAutoGrowPlugin');
        if (autoGrow) autoGrow.apply();
        // 4) 图片就绪后：变量图拉伸到版位（与编辑器变量预览同语义，enliven 的 JSON 宽高是
        //    保存时版位尺寸即 crop 语义，真实图 natural ≠ 它须渲染期拉平，见 variableImageFit），
        //    再重排背景（按原图尺寸 cover/contain/tile），统一由下方既有 requestRenderAll 上屏
        const workspacePlugin = core.getPlugin('RendererWorkspacePlugin');
        if (workspacePlugin) {
          await workspacePlugin.whenImagesLoaded();
          if (seq !== renderSeq) return;
          layoutVariableImages(canvas);
          workspacePlugin.relayoutBackground();
        }
        core.canvas.requestRenderAll();
        emit('rendered', { core, canvas });
      } catch (e) {
        if (seq === renderSeq) emit('error', e);
      }
    };

    onMounted(() => {
      const el = document.getElementById(canvasId);
      canvas = new fabric.Canvas(el, {
        selection: false,
        skipTargetFind: true,
        preserveObjectStacking: true,
        renderOnAddRemove: true,
      });
      const fontAdapter = props.adapters.font;
      core = new RendererCore(canvas, {
        // 渲染器 options 整体透传（templateMode / delimiter / defaultQrCodeData / cacheBust /
        // crossOrigin 等），避免逐键枚举遗漏（如 templateMode 未透传会导致原样模式失效）
        ...props.options,
        getFonts:
          fontAdapter && typeof fontAdapter.list === 'function'
            ? () => fontAdapter.list()
            : undefined,
      });
      // 背景图加载失败（CORS/URL 失效）→ 默认 console 警告 + 转发 renderer-error 事件，
      // 宿主可自行监听覆盖（如 toast 提示）
      core.on('renderer:error', (payload) => {
        // eslint-disable-next-line no-console
        console.warn('[FabricRenderer]', payload);
        emit('renderer-error', payload);
      });
      // 导出被跨域图片污染（tainted canvas）拦截 → 转发 renderer-error 供宿主提示
      core.on('save:error', (err) => {
        const payload = {
          code: (err && err.code) || 'CANVAS_TAINTED',
          message: err && err.message,
        };
        // eslint-disable-next-line no-console
        console.warn('[FabricRenderer]', payload);
        emit('renderer-error', payload);
      });
      emit('ready', { core, canvas });
      render();
    });

    watch(
      () => props.json,
      () => {
        if (core) render();
      }
    );
    // 变量数据变化（深层）时重新渲染
    watch(
      () => props.data,
      () => {
        if (core) render();
      },
      { deep: true }
    );
    // 变量表变化时重新渲染（默认值/校验随 schema 生效）
    watch(
      () => props.schema,
      () => {
        if (core) render();
      }
    );

    onBeforeUnmount(() => {
      if (core) core.destroy();
      core = null;
      canvas = null;
    });

    return {
      canvasId,
    };
  },
};
</script>

<style lang="less" scoped>
// 画布按实际像素尺寸 1:1 显示（不做任何缩放），容器不足时滚动查看
.fabric-renderer {
  width: 100%;
  height: 100%;
  overflow: auto;
}
.fabric-renderer-canvas {
  display: block;
}
</style>
