/*
 * 模板管理扩展示例
 * 展示 extension 的完整用法：
 *  - services: 自动注册 adapter 到 registry（业务自持形状）
 *  - panels: 在左侧新增一个"模板"Tab
 * 业务项目复制本目录即可接入自己的后端。
 */
import { templateAdapter } from './adapter';
import TemplatePanel from './TemplatePanel.vue';

export default {
  id: 'template-manager',
  services: { template: templateAdapter },
  panels: [
    {
      region: 'left',
      tab: { key: 'template', label: '模板', icon: 'md-book' },
      component: TemplatePanel,
    },
  ],
};

export { templateAdapter, TemplatePanel };
