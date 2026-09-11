/*
 * @Author: 秦少卫
 * @Date: 2023-06-20 12:57:35
 * @LastEditors: bigFace2019 599069310@qq.com
 * @LastEditTime: 2024-11-03 20:38:33
 * @Description: 删除快捷键
 */
class DeleteHotKeyPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.hotkeys = ['delete'];
  }
  // 快捷键扩展回调
  hotkeyEvent(eventName, e) {
    if (e.type === 'keydown' && eventName === 'delete') {
      this.del();
    }
  }
  del() {
    const { canvas } = this;
    const activeObject = canvas.getActiveObjects();
    if (activeObject) {
      activeObject.map((item) => canvas.remove(item));
      canvas.requestRenderAll();
      canvas.discardActiveObject();
    }
  }
  contextMenu() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      return [null, { text: '删除', hotkey: 'Delete', disabled: false, onclick: () => this.del() }];
    }
  }
  destroy() {
    console.log('pluginDestroy');
  }
}
DeleteHotKeyPlugin.pluginName = 'DeleteHotKeyPlugin';
DeleteHotKeyPlugin.apis = ['del'];
export default DeleteHotKeyPlugin;
