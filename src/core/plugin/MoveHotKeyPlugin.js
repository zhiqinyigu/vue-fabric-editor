/*
 * @Author: 秦少卫
 * @Date: 2023-06-20 12:52:09
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-04-10 17:32:31
 * @Description: 移动快捷键
 */
class MoveHotKeyPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.hotkeys = ['left', 'right', 'down', 'up'];
  }
  // 快捷键扩展回调
  hotkeyEvent(eventName, e) {
    if (e.type === 'keydown') {
      const { canvas } = this;
      const activeObject = canvas.getActiveObject();
      if (!activeObject) return;
      switch (eventName) {
        case 'left':
          if (activeObject.left === undefined) return;
          activeObject.set('left', activeObject.left - 1);
          break;
        case 'right':
          if (activeObject.left === undefined) return;
          activeObject.set('left', activeObject.left + 1);
          break;
        case 'down':
          if (activeObject.top === undefined) return;
          activeObject.set('top', activeObject.top + 1);
          break;
        case 'up':
          if (activeObject.top === undefined) return;
          activeObject.set('top', activeObject.top - 1);
          break;
        default:
      }
      canvas.renderAll();
    }
  }
  destroy() {
    console.log('pluginDestroy');
  }
}
MoveHotKeyPlugin.pluginName = 'MoveHotKeyPlugin';
export default MoveHotKeyPlugin;
