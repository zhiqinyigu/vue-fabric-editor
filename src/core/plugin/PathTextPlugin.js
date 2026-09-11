import { fabric } from 'fabric';
import { v4 as uuid } from 'uuid';

// Catmull-Rom 样条 → 三次贝塞尔路径（过所有锚点，C1 连续）
function catmullRomPath(points) {
  if (points.length < 2) {
    return null;
  }
  const path = [['M', points[0].x, points[0].y]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path.push(['C', c1x, c1y, c2x, c2y, p2.x, p2.y]);
  }
  return path;
}

// Douglas-Peucker 简化：抹掉手抖微折，保留整体形状
function simplifyPoints(points, tolerance = 3) {
  if (points.length <= 2) {
    return points.slice();
  }
  const sqTol = tolerance * tolerance;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    if (end - start <= 1) {
      continue;
    }
    const sx = points[start].x;
    const sy = points[start].y;
    const ex = points[end].x;
    const ey = points[end].y;
    const dx = ex - sx;
    const dy = ey - sy;
    const segLenSq = dx * dx + dy * dy;
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const px = points[i].x - sx;
      const py = points[i].y - sy;
      let t = segLenSq ? (px * dx + py * dy) / segLenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const ddx = points[i].x - (sx + t * dx);
      const ddy = points[i].y - (sy + t * dy);
      const dist = ddx * ddx + ddy * ddy;
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxIdx >= 0 && maxDist > sqTol) {
      keep[maxIdx] = true;
      stack.push([start, maxIdx]);
      stack.push([maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// 平滑转换：简化去抖 → Catmull-Rom 平滑曲线（替换 fabric 默认的中点-二次贝塞尔）
function smoothConvertPointsToSVGPath(points) {
  const cleaned = simplifyPoints(points, 3);
  const pathData = catmullRomPath(cleaned);
  return pathData || fabric.util.getSmoothPathFromPoints(points, 0);
}

// 序列化修复：fabric.IText.fromObject 不重建 path（恢复为普通对象），且 editable 丢失。
// 补丁已抽取至 objects/CustomIText（编辑器与渲染器共用），此处引入以应用补丁。
import '../objects/CustomIText';

class PathTextPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this._beforeHandler = (opt) => {
      if (this.options == null) {
        return;
      }
      const path = opt.path;
      path.segmentsInfo = fabric.util.getPathSegmentsInfo(path.path);
      path.set({ stroke: this.options.lineColor });
      this._createPathText(path);
    };
    this._createdHandler = (opt) => {
      this.canvas.remove(opt.path);
      // 生成完成后结束绘制模式并回调（供 UI 结束交互 / 选中新文本）
      const cb = this.options && this.options.onCreated;
      if (cb && this._lastCreatedText) {
        const textObject = this._lastCreatedText;
        this._lastCreatedText = null;
        cb(textObject);
      }
      this.endTextPathDraw();
    };
  }
  // 生成挂在路径上的文本并加入画布
  _createPathText(path) {
    const textObject = new fabric.IText(this.options.defaultText, {
      shadow: '',
      fontFamily: 'arial',
      fontSize: this.options.defaultFontSize,
      top: path.top,
      left: path.left,
      fill: this.options.color,
      path: path,
      id: uuid(),
      // 路径文字元素禁止在画布上直接编辑（经右侧面板编辑）
      editable: false,
    });
    // 序列化 editable，保证保存/加载后仍不可直接编辑
    textObject.toObject = function (propertiesToInclude) {
      const o = this.callSuper('toObject', propertiesToInclude);
      if (this.editable === false) {
        o.editable = false;
      }
      return o;
    };
    this.canvas.add(textObject);
    this._lastCreatedText = textObject;
    return textObject;
  }
  _bindEvent() {
    this.canvas.on('before:path:created', this._beforeHandler);
    this.canvas.on('path:created', this._createdHandler);
  }
  _unbindEvent() {
    this.canvas.off('before:path:created', this._beforeHandler);
    this.canvas.off('path:created', this._createdHandler);
  }
  startTextPathDraw(options = {}) {
    const defaultOptions = {
      decimate: 3,
      width: 2,
      defaultText: '诸事顺遂 万事大吉',
      color: '#000000',
      lineColor: '#000000',
      defaultFontSize: 20,
    };
    this.options = {
      ...defaultOptions,
      ...options,
    };
    this.canvas.isDrawingMode = true;
    const brush = (this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas));
    brush.decimate = this.options.decimate;
    brush.width = this.options.width;
    brush.color = this.options.color;
    // 自动平滑：简化去抖 + Catmull-Rom 平滑，替代 fabric 默认中点-二次贝塞尔
    brush.convertPointsToSVGPath = function (points) {
      return smoothConvertPointsToSVGPath(points);
    };
    this._bindEvent();
  }
  endTextPathDraw() {
    if (this.options == null) {
      return;
    }
    this.canvas.isDrawingMode = false;
    this._unbindEvent();
    this.options = null;
  }
}
PathTextPlugin.pluginName = 'PathTextPlugin';
PathTextPlugin.apis = ['startTextPathDraw', 'endTextPathDraw'];
export default PathTextPlugin;
