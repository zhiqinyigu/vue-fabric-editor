<template>
  <div class="renderer-demo">
    <div class="rd-side">
      <Card dis-hover>
        <p slot="title">变量数据（按 JSON 动态枚举）</p>
        <div class="rd-form">
          <template v-if="variables.length">
            <div v-for="path in variables" :key="path" class="rd-field">
              <label class="rd-label">{{ tokenOf(path) }}</label>
              <Input
                :value="data[path]"
                :placeholder="tokenOf(path)"
                @input="(v) => setVar(path, v)"
              />
            </div>
          </template>
          <p v-else class="rd-status">JSON 中未检测到变量占位符</p>
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">操作</p>
        <div class="rd-actions">
          <Button type="primary" @click="onExport">导出 PNG</Button>
          <Button @click="onRerender">重新渲染</Button>
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">粘贴 JSON（覆盖示例海报）</p>
        <Input
          v-model="pasteJson"
          type="textarea"
          :rows="10"
          placeholder='{"objects":[...] }，编辑器 exportFile("json") 或 api.getJson() 的输出'
        />
        <div class="rd-actions rd-json-actions">
          <Button type="primary" size="small" @click="onApplyJson">应用 JSON</Button>
          <Button size="small" @click="onResetJson">重置示例</Button>
        </div>
      </Card>

      <Card dis-hover>
        <p slot="title">状态</p>
        <p class="rd-status">{{ status }}</p>
      </Card>
    </div>

    <div class="rd-stage">
      <FabricRenderer
        :key="renderKey"
        ref="renderer"
        :json="json"
        :data="data"
        :adapters="adapters"
        @ready="onReady"
        @rendered="onRendered"
        @error="onError"
        @renderer-error="onRendererError"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed, watch } from '@vue/composition-api';
import { Card, Input, Button, Message } from 'view-design';
import FabricRenderer from '@/lib/FabricRenderer.vue';
import { extractVariables, DEFAULT_DELIMITER } from '@/core/variableEngine';

// 示例海报 JSON（编辑器 getJson 输出，含变量占位 / autoGrow / follow / 二维码 / 变量图片）
function makePosterJson() {
  return {
    version: '5.3.0',
    objects: [
      {
        type: 'rect',
        id: 'workspace',
        left: 0,
        top: 0,
        width: 360,
        height: 640,
        fill: '#ffffff',
        selectable: false,
        hasControls: false,
      },
      {
        type: 'image',
        id: 'backgroundImage',
        left: 0,
        top: 0,
        width: 360,
        height: 640,
        src: '{{bg}}',
        crossOrigin: 'anonymous',
        isVariableBackground: true,
        backgroundImageMode: 'cover',
        backgroundPosition: { x: 0.5, y: 0.5 },
        selectable: false,
        evented: false,
      },
      {
        type: 'rect',
        id: 'bgCard',
        left: 12,
        top: 12,
        width: 336,
        height: 616,
        rx: 12,
        ry: 12,
        fill: '#f6f8fb',
        stroke: '#e6eaf2',
        strokeWidth: 1,
      },
      {
        type: 'textbox',
        id: 'title',
        left: 30,
        top: 40,
        width: 300,
        height: 40,
        text: '{{name}}',
        fontSize: 28,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fill: '#1f2329',
      },
      {
        type: 'image',
        id: 'avatar',
        left: 30,
        top: 120,
        width: 240,
        height: 160,
        src: '{{avatar}}',
        crossOrigin: 'anonymous',
        isVariableImage: true,
        cropX: 0,
        cropY: 0,
      },
      {
        type: 'textbox',
        id: 'content',
        left: 30,
        top: 320,
        width: 300,
        height: 60,
        text: '{{content}}',
        fontSize: 16,
        fontFamily: 'Arial',
        lineHeight: 1.5,
        fill: '#4b5563',
        autoGrow: true,
        clipEnabled: false,
      },
      {
        type: 'image',
        id: 'qr',
        left: 120,
        top: 460,
        width: 120,
        height: 120,
        extensionType: 'qrcode',
        extension: {
          data: '{{qr}}',
          width: 300,
          margin: 10,
          errorCorrectionLevel: 'M',
          dotsColor: '#000000',
          dotsType: 'rounded',
          cornersSquareColor: '#000000',
          cornersSquareType: 'square',
          cornersDotColor: '#000000',
          cornersDotType: 'square',
          background: '#ffffff',
        },
      },
      {
        type: 'rect',
        id: 'footer',
        left: 30,
        top: 620,
        width: 300,
        height: 28,
        rx: 6,
        ry: 6,
        fill: '#e6eaf2',
        follow: 'content',
      },
    ],
    variableMeta: {
      delimiter: { start: '{{', end: '}}' },
      variables: [
        { name: 'name', example: '活动海报' },
        { name: 'content', example: '这里是一段正文' },
        { name: 'avatar', example: 'https://picsum.photos/seed/a/240/160' },
        { name: 'bg', example: 'https://picsum.photos/seed/bg/720/1280' },
        { name: 'qr', example: 'https://example.com' },
      ],
    },
  };
}

export default {
  name: 'RendererDemo',
  components: { FabricRenderer, Card, Input, Button },
  setup() {
    const json = ref(makePosterJson());
    const pasteJson = ref('');
    // 变量数据：扁平映射表 path -> value（renderObjects/getValueByPath 支持顶层完整路径 key）
    const data = ref({});
    const status = ref('待渲染');
    const renderer = ref(null);
    const renderKey = ref(0);
    let core = null;

    const adapters = {
      font: {
        list: () =>
          Promise.resolve([
            { name: 'Arial', file: '', img: '' },
            { name: '微软雅黑', file: '', img: '' },
          ]),
      },
    };

    // 按当前 JSON 动态枚举变量路径（含 group.objects / 背景 rect 的 fill.source）
    const variables = computed(() => extractVariables(json.value || {}));
    const delimiterOf = () => {
      const meta = json.value && json.value.variableMeta && json.value.variableMeta.delimiter;
      return meta && meta.start !== undefined ? meta : DEFAULT_DELIMITER;
    };
    const tokenOf = (path) => {
      const d = delimiterOf();
      return `${d.start}${path}${d.end}`;
    };

    // 重建数据表：为每个变量留一个字段；已填值保留，新变量补空，多余字段清掉
    const rebuildData = (seedExamples) => {
      const prev = data.value || {};
      const next = {};
      variables.value.forEach((path) => {
        next[path] = prev[path] !== undefined ? prev[path] : '';
      });
      // 用 variableMeta.variables[].example 作为示例值（仅首次/空值时回填）
      if (seedExamples) {
        const meta = json.value && json.value.variableMeta;
        if (meta && Array.isArray(meta.variables)) {
          meta.variables.forEach((v) => {
            if (v && typeof v.path === 'string' && v.example !== undefined && next[v.path] === '') {
              next[v.path] = v.example;
            }
          });
        }
      }
      data.value = next;
    };
    const setVar = (path, value) => {
      data.value = { ...data.value, [path]: value };
    };

    // JSON 变化 → 重新枚举变量并重建数据表
    watch(
      () => json.value,
      () => rebuildData(true),
      { deep: false }
    );
    rebuildData(true);

    const onReady = ({ core: c }) => {
      core = c;
      status.value = '已就绪，渲染中…';
    };

    const onRendered = () => {
      status.value = '渲染完成';
    };

    const onError = (e) => {
      status.value = '渲染失败：' + (e && e.message);
      Message.error(status.value);
    };

    const onRendererError = (payload) => {
      status.value = '背景加载失败：' + (payload && payload.src);
      Message.error('背景图加载失败（地址失效或服务器不支持 CORS）');
    };

    const onExport = async () => {
      if (!core) {
        Message.warning('渲染器未就绪');
        return;
      }
      try {
        const servers = core.getPlugin('ServersPlugin');
        if (!servers || typeof servers.preview !== 'function') {
          Message.warning('导出能力不可用');
          return;
        }
        const dataUrl = await servers.preview(2);
        // 画布被跨域图片污染时 preview 返回 null（servers 已 emit save:error）
        if (!dataUrl) {
          status.value = '导出失败：画布包含跨域图片';
          Message.error('导出失败：画布包含跨域图片，无法导出');
          return;
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'poster.png';
        a.click();
        Message.success('已导出 PNG');
      } catch (e) {
        Message.error('导出失败：' + e.message);
      }
    };

    const onRerender = () => {
      status.value = '重新渲染中…';
      core = null;
      renderKey.value += 1;
    };

    const onApplyJson = () => {
      const text = (pasteJson.value || '').trim();
      if (!text) {
        Message.warning('请先粘贴 JSON');
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.objects)) {
          throw new Error('JSON 缺少 objects 数组');
        }
        json.value = parsed;
        status.value = '已应用粘贴的 JSON，渲染中…';
        core = null;
        renderKey.value += 1;
        Message.success('已应用 JSON');
      } catch (e) {
        Message.error('JSON 解析失败：' + e.message);
      }
    };

    const onResetJson = () => {
      pasteJson.value = '';
      json.value = makePosterJson();
      status.value = '已重置示例，渲染中…';
      core = null;
      renderKey.value += 1;
    };

    return {
      json,
      pasteJson,
      data,
      variables,
      tokenOf,
      setVar,
      adapters,
      status,
      renderer,
      renderKey,
      onReady,
      onRendered,
      onError,
      onRendererError,
      onExport,
      onRerender,
      onApplyJson,
      onResetJson,
    };
  },
};
</script>

<style lang="less" scoped>
.renderer-demo {
  height: 100vh;
  display: flex;
  gap: 16px;
  padding: 16px;
  box-sizing: border-box;
  background: #f1f2f5;
}
.rd-side {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}
.rd-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rd-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rd-label {
  font-size: 12px;
  color: #86909c;
  margin-top: 6px;
}
.rd-actions {
  display: flex;
  gap: 12px;
}
.rd-json-actions {
  margin-top: 10px;
}
.rd-status {
  font-size: 13px;
  color: #4b5563;
  word-break: break-all;
}
.rd-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: auto;
  padding: 24px;
}
// 海报按实际像素 1:1 显示，容器不足时滚动查看
.rd-stage /deep/ .fabric-renderer {
  width: 100%;
  height: 100%;
  overflow: auto;
}
</style>
