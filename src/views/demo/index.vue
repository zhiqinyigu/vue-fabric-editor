<template>
  <div style="height: 100vh; overflow: hidden">
    <FabricEditor
      ref="editor"
      :adapters="adapters"
      :extensions="extensions"
      @ready="onReady"
      @save-request="onSave"
    />
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { Message } from 'view-design';
import FabricEditor from '@/lib';
import templateExtension, { templateAdapter } from '@/examples/template-extension';
import onlineImageExtension from '@/examples/online-image';
import aiToolsExtension from '@/examples/ai-tools-extension';

export default {
  name: 'DemoApp',
  components: { FabricEditor },
  setup() {
    const editor = ref(null);

    // 内置能力（可选）：字体 / 尺寸
    const adapters = {
      font: {
        list: () =>
          Promise.resolve([
            { name: 'Arial', file: '', img: '' },
            { name: '微软雅黑', file: '', img: '' },
          ]),
      },
      size: {
        list: () =>
          Promise.resolve([
            { id: 1, name: '海报', width: 400, height: 600, unit: 'px' },
            { id: 2, name: '横幅', width: 800, height: 200, unit: 'px' },
          ]),
      },
    };

    // 扩展：模板管理 + 在线图片(CDN上传) + AI
    const extensions = [templateExtension, onlineImageExtension, aiToolsExtension];

    const getQuery = () => new URLSearchParams(window.location.search);

    // 业务自己控制初始加载（无路由依赖）
    const onReady = ({ api }) => {
      const q = getQuery();
      const tempId = q.get('tempId');
      if (tempId) {
        templateAdapter.get(tempId).then(({ json }) => api.loadJSON(json));
      }
    };

    // 保存：外壳按钮只 emit save-request，持久化归业务
    const onSave = async ({ json }) => {
      const q = getQuery();
      const id = q.get('id');
      if (id) {
        await templateAdapter.update(id, { json });
      } else {
        const { id: newId } = await templateAdapter.create({ name: '未命名作品', json });
        console.log('saved as', newId);
      }
      Message.success('已保存');
    };

    return { editor, adapters, extensions, onReady, onSave };
  },
};
</script>
