<template>
  <div>
    <Divider plain orientation="left">AI 工具</Divider>
    <div class="ai-tip">
      这是一个 AI 扩展骨架示例。业务项目在此定义自己的 AI adapter 契约（generate/history 等），
      并在面板中调用 registry.get('ai') 使用。
    </div>
    <Button long type="primary" ghost :loading="loading" @click="generate">
      生成一张图（示例）
    </Button>
    <div v-if="result" class="ai-result">{{ result }}</div>
  </div>
</template>

<script>
import { ref } from '@vue/composition-api';
import { Message } from 'view-design';
import { useEditorContext } from '@/hooks/useEditorContext';

export default {
  name: 'AiToolsPanel',
  setup() {
    const { registry } = useEditorContext();
    // 读取本扩展通过 services 注册的 'ai' 适配器（形状由业务自定义）
    const ai = registry.get('ai');
    const loading = ref(false);
    const result = ref('');

    const generate = async () => {
      if (!ai || typeof ai.generate !== 'function') {
        Message.info('未注册 ai 适配器，请在扩展 services 中提供');
        return;
      }
      loading.value = true;
      try {
        const { url } = await ai.generate({ prompt: '示例 prompt' });
        result.value = `生成完成: ${url}`;
        // 业务可将生成的图片 url 插入画布
        // const img = await api.editor.createImgByElement({ src: url });
        // api.editor.addBaseType(img, { scale: true });
      } finally {
        loading.value = false;
      }
    };

    return { loading, result, generate };
  },
};
</script>

<style scoped lang="less">
.ai-tip {
  font-size: 12px;
  color: #999;
  margin-bottom: 12px;
  line-height: 1.6;
}
.ai-result {
  margin-top: 12px;
  font-size: 12px;
  word-break: break-all;
}
</style>
