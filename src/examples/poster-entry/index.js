/*
 * 海报字段入口示例（多海报配置 + 独立编辑器页交接，悬停浮层交互）
 * - PosterEntries：多海报字段入口容器
 * - PosterEntryCardHover：业务外壳卡片（Card 标题/状态 Tag/描述）
 * - PosterEntryStage：预览交互舞台（预览画框 + 悬停浮层 + 查看/配置弹窗，UI 中性）
 * - PosterViewModal：查看/配置双模式弹窗（预览大图 ↔ JSON 输入，复制导出/跳编辑页/删除收敛在内）
 * - PosterPreview：共享预览画框（contain 等比缩放，杜绝 1:1 画布撑开容器）
 * - PosterEditorHost：编辑器页宿主薄壳（读取交接信封 → 编辑 → save-request 回传）
 * - handoff：一次性信封交接协议（纯函数，可替换为后端草稿实现）
 */
export { default as PosterEntries } from './PosterEntries.vue';
export { default as PosterEntryCardHover } from './PosterEntryCardHover.vue';
export { default as PosterEntryStage } from './PosterEntryStage.vue';
export { default as PosterPreview } from './PosterPreview.vue';
export { default as PosterViewModal } from './PosterViewModal.vue';
export { default as PosterEditorHost } from './PosterEditorHost.vue';
export * from './usePosterEntry';
export * from './handoff';
