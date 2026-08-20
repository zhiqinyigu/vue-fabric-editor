/*
 * 在线图片功能接入示例
 *
 * 两种接入方式（可同时用）：
 *  1. L1 能力驱动：注册 asset 适配器 → 内置 imagePickerModal 自动出现"上传图片"Tab
 *  2. L2 整体覆盖：overrides 替换内置弹窗为品牌化组件
 *
 * 业务项目在 <FabricEditor> 上传 adapters/extensions 即可。
 */
import { assetAdapter } from './assetAdapter';
import MyBrandedModal from './MyBrandedModal.vue';

// 方式一：直接作为 adapter 传入（L1）
export { assetAdapter };

// 方式二：作为扩展（L2 覆盖 + L1 适配器一并注册）
export const onlineImageExtension = {
  id: 'brand-online-image',
  services: { asset: assetAdapter },
  overrides: [{ component: 'imagePickerModal', with: MyBrandedModal }],
};

export default onlineImageExtension;
