<template>
  <div class="renderer-demo">
    <div class="rd-side">
      <Card dis-hover>
        <p slot="title">变量数据</p>
        <div class="rd-form">
          <label class="rd-label">标题（{{ nameToken }}）</label>
          <Input v-model="data.name" placeholder="标题文字" />
          <label class="rd-label">正文（{{ contentToken }}，autoGrow 增高）</label>
          <Input
            v-model="data.content"
            type="textarea"
            :rows="3"
            placeholder="正文内容，变长时海报随之增高"
          />
          <label class="rd-label">头像 URL（{{ avatarToken }}，变量图片）</label>
          <Input v-model="data.avatar" placeholder="https://picsum.photos/seed/a/240/160" />
          <label class="rd-label">二维码内容（{{ qrToken }}）</label>
          <Input v-model="data.qr" placeholder="https://example.com" />
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
      />
    </div>
  </div>
</template>

<script>
import { reactive, ref } from '@vue/composition-api';
import { Card, Input, Button, Message } from 'view-design';
import FabricRenderer from '@/lib/FabricRenderer.vue';

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
    const data = reactive({
      name: '夏日促销活动',
      content: '全场商品低至五折起，多买多送，快来选购吧！',
      avatar: 'https://picsum.photos/seed/poster/240/160',
      qr: 'https://example.com',
    });
    const status = ref('待渲染');
    const renderer = ref(null);
    const renderKey = ref(0);
    const nameToken = '{{name}}';
    const contentToken = '{{content}}';
    const avatarToken = '{{avatar}}';
    const qrToken = '{{qr}}';
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
      adapters,
      status,
      renderer,
      renderKey,
      nameToken,
      contentToken,
      avatarToken,
      qrToken,
      onReady,
      onRendered,
      onError,
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
