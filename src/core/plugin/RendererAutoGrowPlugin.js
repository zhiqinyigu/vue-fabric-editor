/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-27 11:12:28
 * 渲染器精简版 AutoGrowPlugin（对应编辑器 AutoGrowPlugin）
 * 渲染真实数据后：按同一规则（variableEngine.computeAutoGrowSize）计算增高尺寸并应用位移，
 * follow 元素保持"设计态相对间距"下移；workspace 静默增高。
 */
import { computeAutoGrowSize } from '../variableEngine';

class RendererAutoGrowPlugin {
  constructor(canvas, editor, options = {}) {
    this.canvas = canvas;
    this.editor = editor;
    this.options = options;
  }
  _getWorkspacePlugin() {
    return this.editor.getPlugin && this.editor.getPlugin('RendererWorkspacePlugin');
  }
  // 收集画布顶层对象几何（group 内对象坐标非画布级，不参与）
  _collectObjects() {
    const objects = [];
    const byId = {};
    this.canvas.getObjects().forEach((obj) => {
      if (!obj || obj.objects || obj.id == null) return;
      const item = {
        id: String(obj.id),
        top: obj.get('top'),
        height: obj.get('height') || 0,
        scaleX: obj.get('scaleX') || 1,
        scaleY: obj.get('scaleY') || 1,
        originY: obj.get('originY'),
        autoGrow: !!obj.get('autoGrow'),
        autoGrowMinHeight: Number(obj.get('autoGrowMinHeight')) || null,
        autoGrowMaxHeight: Number(obj.get('autoGrowMaxHeight')) || null,
        follow: obj.get('follow') != null ? String(obj.get('follow')) : null,
      };
      objects.push(item);
      byId[item.id] = obj;
    });
    return { objects, byId };
  }
  // 渲染真实数据后应用增高（designMap/designHeight 由 RendererWorkspacePlugin.hookImportAfter 建立）
  apply() {
    const wsPlugin = this._getWorkspacePlugin();
    const ws = wsPlugin && wsPlugin.getWorkspace();
    if (!ws) return;
    const { objects, byId } = this._collectObjects();
    const { height, updates } = computeAutoGrowSize(objects, {
      designHeight: (wsPlugin && wsPlugin.designHeight) || ws.get('height') || 0,
      designMap: (wsPlugin && wsPlugin.designMap) || {},
    });
    updates.forEach(({ id, top }) => {
      const obj = byId[id];
      if (obj) {
        obj.set('top', top);
        if (obj.setCoords) obj.setCoords();
      }
    });
    if (height > 0 && wsPlugin && wsPlugin.resizeSilent) {
      wsPlugin.resizeSilent(height);
    }
    this.canvas.requestRenderAll();
  }
  destroy() {
    console.log('rendererAutoGrowDestroy');
  }
}
RendererAutoGrowPlugin.pluginName = 'RendererAutoGrowPlugin';

export default RendererAutoGrowPlugin;
