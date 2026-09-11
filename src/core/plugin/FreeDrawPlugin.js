import { fabric } from 'fabric';
import { v4 as uuid } from 'uuid';
class FreeDrawPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this._createdHandler = (opt) => {
      opt.path.set('id', uuid());
    };
  }
  _bindEvent() {
    this.canvas.on('path:created', this._createdHandler);
  }
  _unbindEvent() {
    this.canvas.off('path:created', this._createdHandler);
  }
  startDraw(options) {
    this.canvas.isDrawingMode = true;
    this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
    this.canvas.freeDrawingBrush.width = options.width;
    this._bindEvent();
  }
  endDraw() {
    if (this.canvas.isDrawingMode) {
      this.canvas.isDrawingMode = false;
      this._unbindEvent();
      return;
    }
  }
}
FreeDrawPlugin.pluginName = 'FreeDrawPlugin';
FreeDrawPlugin.apis = ['startDraw', 'endDraw'];
export default FreeDrawPlugin;
