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
    // ---- 变量表（schema，业务无关注入/消费面）----
    // 直接注入静态变量表（无 adapter 场景）；视为导入（只读）
    setVariableSchema: (defs) => editor.setVariableSchema(defs),
    getVariableSchema: () => editor.getVariableSchema(),
    // 懒加载（adapter 场景）：幂等；失败 reject 由调用方降级
    ensureVariableSchemaLoaded: () => editor.ensureSchemaLoaded(),
    // 自定义变量 CRUD（导入变量只读）
    addCustomVariable: (def) => editor.addCustomVariable(def),
    updateCustomVariable: (path, patch) => editor.updateCustomVariable(path, patch),
    removeCustomVariable: (path) => editor.removeCustomVariable(path),
    isImportedVariable: (path) => editor.isImportedVariable(path),
    // 开发者后门：解锁/恢复 imported 变量的删除限制（默认仅开发联调使用）
    setSchemaEditable: (editable = true) => editor.setSchemaEditable(editable),
    isSchemaEditable: () => editor.isSchemaEditable(),
    // 保存到业务后台（adapter.save；未实现时 reject，改走导出）
    saveVariableSchema: () => editor.saveVariableSchema(),
    // 导出变量表 JSON 字符串（交开发录入后台的对接兜底）
    exportVariableSchema: () => editor.exportVariableSchema(),
    // 画布扫描 [{ path, fields }]（对齐视图 / 收编数据源）
    getVariableEntries: () => editor.getVariableEntries(),
  };
}
