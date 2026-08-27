/*
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * 编辑器命令式 API
 * 业务通过 <FabricEditor ref> 拿到的 editor.api
 * 底层直接透传引擎方法（Editor 已把插件方法绑定到自身）
 */
export function createEditorApi(ctx) {
  const { editor, registry, ui } = ctx;
  return {
    get editor() {
      return editor;
    },
    get canvas() {
      return editor && editor.canvas;
    },
    // ---- 画布操作 ----
    loadJSON: (json) => editor.loadJSON(json),
    getJSON: () => editor.getJson(),
    setSize: (w, h) => editor.setSize(w, h),
    getSize: () => editor.getWorkspase(),
    clear: () => editor.clear(),
    preview: () => editor.preview(),
    exportFile: (type = 'json', multiplier = 1) => {
      if (type === 'json') return editor.saveJson();
      if (type === 'svg') return editor.saveSvg();
      if (type === 'png') return editor.saveImg(multiplier);
    },
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    getSelectMode: () => editor.getSelectMode(),
    // ---- 注册表 ----
    registerAdapter: (key, value) => registry.register(key, value),
    getAdapter: (key) => registry.get(key),
    hasAdapter: (key) => registry.has(key),
    registerComponent: (key, component) => ui.register(key, component),
    getComponent: (key) => ui.get(key),
    // ---- 扩展 ----
    registerExtension: (ext) => ctx.extensions.register(ext),
    unregisterExtension: (id) => ctx.extensions.unregister(id),
    // ---- 事件（EventEmitter 透传） ----
    on: (event, cb) => editor.on(event, cb),
    off: (event, cb) => editor.off(event, cb),
    emit: (event, payload) => editor.emit(event, payload),
    // ---- 插件 ----
    getPlugin: (name) => editor.getPlugin(name),
  };
}