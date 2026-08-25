import { fabric } from 'fabric';
import { v4 as uuid } from 'uuid';
class PathTextPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this._beforeHandler = (opt) => {
            if (this.options == null)
                return;
            const path = opt.path;
            const getPathSegmentsInfo = fabric.util.getPathSegmentsInfo;
            path.segmentsInfo = getPathSegmentsInfo(path.path);
            path.set({ stroke: this.options.lineColor });
            const text = this.options.defaultText;
            const fontSize = this.options.defaultFontSize;
            const textObject = new fabric.IText(text, {
                shadow: '',
                fontFamily: 'arial',
                fontSize: fontSize,
                top: path.top,
                left: path.left,
                fill: this.options.color,
                path: path,
                id: uuid(),
                // 路径文字元素禁止在画布上直接编辑
                editable: false,
            });
            this.canvas.add(textObject);
        };
        this._createdHandler = (opt) => {
            this.canvas.remove(opt.path);
        };
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
            decimate: 8,
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
        this._bindEvent();
    }
    endTextPathDraw() {
        this.canvas.isDrawingMode = false;
        this._unbindEvent();
    }
}
PathTextPlugin.pluginName = 'PathTextPlugin';
PathTextPlugin.apis = ['startTextPathDraw', 'endTextPathDraw'];
export default PathTextPlugin;
