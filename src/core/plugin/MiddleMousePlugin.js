/*
 * @Author: George
 * @Date: 2024-10-29 11:11:11
 * @LastEditors: George
 * @LastEditTime: 2024-10-29 11:11:11
 * @Description: 鼠标中键点击事件插件
 */
class MiddleMousePlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.handleMouseUp = (e) => e.button === 1 && this.canvas.fire('mouse:up', { e });
    this.handleMouseDown = (e) => e.button === 1 && this.canvas.fire('mouse:down', { e });
    this.init();
  }
  init() {
    const workspaceEl = document.querySelector('#workspace');
    if (!workspaceEl) {
      throw new Error('element #workspace is missing, plz check!');
    }
    this.workspaceEl = workspaceEl;
    this.initListener();
  }
  /**
   * @desc 初始化鼠标中键监听事件
   */
  initListener() {
    this.workspaceEl.addEventListener('mouseup', this.handleMouseUp);
    this.workspaceEl.addEventListener('mousedown', this.handleMouseDown);
  }
  destroy() {
    this.workspaceEl.removeEventListener('mouseup', this.handleMouseUp);
    this.workspaceEl.removeEventListener('mousedown', this.handleMouseDown);
    console.log('pluginDestroy');
  }
}
MiddleMousePlugin.pluginName = 'MiddleMousePlugin';
export default MiddleMousePlugin;
