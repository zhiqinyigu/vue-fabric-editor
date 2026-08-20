/*
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 编辑器上下文（provide/inject 桥）
 * 业务扩展组件内通过 useEditorContext() 获取 canvas / editor / api / registry / t
 */
import { inject, provide } from '@vue/composition-api';

export const EditorContextKey = '__fabric_editor_context__';

export function provideEditorContext(ctx) {
  provide(EditorContextKey, ctx);
}

const EMPTY_REGISTRY = {
  get: () => undefined,
  has: () => false,
  register: () => () => {},
};

export function useEditorContext() {
  const ctx = inject(EditorContextKey, null);
  if (ctx) return ctx;
  // 编辑器外部使用时不抛错，降级为空上下文
  return {
    canvas: null,
    editor: null,
    api: null,
    registry: EMPTY_REGISTRY,
    ui: EMPTY_REGISTRY,
    t: (key) => key,
  };
}

export default useEditorContext;