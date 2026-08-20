/*
 * AI 工具扩展骨架
 * 展示：业务自定义 adapter 契约 + 左侧面板 + 生命周期钩子
 * 业务项目在此实现自己的 ai.generate / ai.history 等，并用任意请求库调用大模型服务。
 */
import AiToolsPanel from './AiToolsPanel.vue';

const aiAdapter = {
  // 业务自定义契约，形状由业务定
  async generate({ prompt } = {}) {
    // const { data } = await axios.post('https://ai.example.com/generate', { prompt })
    // return { url: data.url }
    await new Promise((r) => setTimeout(r, 800));
    return { url: `mock://ai-generated/${encodeURIComponent(prompt || 'default')}.png` };
  },
  async history() {
    return [];
  },
};

export default {
  id: 'ai-tools',
  services: { ai: aiAdapter },
  panels: [
    {
      region: 'left',
      tab: { key: 'ai', label: 'AI', icon: 'ios-bulb-outline' },
      component: AiToolsPanel,
    },
  ],
  lifecycle: {
    onReady(ctx) {
      console.log('[ai-tools] ready', ctx);
    },
    onDestroy() {
      console.log('[ai-tools] destroyed');
    },
  },
};

export { aiAdapter, AiToolsPanel };
