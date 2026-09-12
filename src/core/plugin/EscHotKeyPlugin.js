/*
 * @Author: cyc
 * @Description: ESC 快捷键：取消选中（多选一并支持）
 *
 * 背景：画布选中通常靠点击空白取消；在"画布状态被异常打断"（如序列化中途抛错
 * 跳过 fabric 内部选中状态清理）时点击会失效，ESC 是不依赖鼠标命中的兜底逃生门。
 * 文本编辑中：先 exitEditing() 退出编辑、保留选中（fabric 惯例）。
 * hotkeys-js 默认过滤 input/textarea 焦点，不会干扰表单输入；Modal 打开时按 ESC
 * 同时触发 Modal 关闭与本插件取消选中——取消选中对画布无副作用，不额外抑制。
 */
class EscHotKeyPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.hotkeys = ['esc'];
  }
  // 快捷键扩展回调
  hotkeyEvent(eventName, e) {
    if (e.type === 'keydown' && eventName === 'esc') {
      this.exit();
    }
  }
  exit() {
    const { canvas } = this;
    const activeObject = canvas.getActiveObject();
    if (!activeObject) return;
    // 文本编辑中：先退出编辑、保留选中（由用户下一步决定去留）
    if (activeObject.isEditing) {
      activeObject.exitEditing();
      canvas.requestRenderAll();
      return;
    }
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }
  destroy() {}
}
EscHotKeyPlugin.pluginName = 'EscHotKeyPlugin';
EscHotKeyPlugin.apis = ['exit'];
EscHotKeyPlugin.events = [];
export default EscHotKeyPlugin;
