/*
 * @Author: June
 * @Description: 水印插件
 * @Date: 2024-04-21 08:30:48
 * @LastEditors: June 1601745371@qq.com
 * @LastEditTime: 2024-05-23 17:56:45
 */
import { cloneDeep } from 'lodash-es';
var POSITION;
(function (POSITION) {
  POSITION['lt'] = 'Left_Top';
  POSITION['lb'] = 'Left_Right';
  POSITION['rt'] = 'Right_Top';
  POSITION['rb'] = 'Right_Bottom';
  POSITION['full'] = 'Full';
})(POSITION || (POSITION = {}));
const defaultOptions = {
  text: '',
  size: 24,
  isRotate: false,
  fontFamily: '汉体',
  color: '#ccc',
  position: POSITION.lt,
};
class WaterMarkPlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.hadDraw = false;
    this.drawOps = defaultOptions;
    // 待优化
    this.drawing = {
      [POSITION.lt]: (width, height, cb) => {
        let waterCanvas = this.createCanvas(width, height);
        const w = waterCanvas.width || width;
        let ctx = waterCanvas.getContext('2d');
        ctx.fillStyle = this.drawOps.color;
        ctx.font = `${this.drawOps.size}px ${this.drawOps.fontFamily}`;
        ctx.fillText(this.drawOps.text, 10, this.drawOps.size + 10, w - 20);
        cb && cb(waterCanvas.toDataURL());
        waterCanvas = null;
        ctx = null;
      },
      [POSITION.rt]: (width, height, cb) => {
        let waterCanvas = this.createCanvas(width, height);
        let ctx = waterCanvas.getContext('2d');
        const w = waterCanvas.width || width;
        ctx.fillStyle = this.drawOps.color;
        ctx.font = `${this.drawOps.size}px ${this.drawOps.fontFamily}`;
        ctx.fillText(
          this.drawOps.text,
          w - ctx.measureText(this.drawOps.text).width - 20,
          this.drawOps.size + 10,
          w - 20
        );
        cb && cb(waterCanvas.toDataURL());
        waterCanvas = null;
        ctx = null;
      },
      [POSITION.lb]: (width, height, cb) => {
        let waterCanvas = this.createCanvas(width, height);
        let ctx = waterCanvas.getContext('2d');
        const w = waterCanvas.width || width;
        const h = waterCanvas.height || height;
        ctx.fillStyle = this.drawOps.color;
        ctx.font = `${this.drawOps.size}px ${this.drawOps.fontFamily}`;
        ctx.fillText(this.drawOps.text, 10, h - this.drawOps.size, w - 20);
        cb && cb(waterCanvas.toDataURL());
        waterCanvas = null;
        ctx = null;
      },
      [POSITION.rb]: (width, height, cb) => {
        let waterCanvas = this.createCanvas(width, height);
        let ctx = waterCanvas.getContext('2d');
        const w = waterCanvas.width || width;
        ctx.fillStyle = this.drawOps.color;
        ctx.font = `${this.drawOps.size}px ${this.drawOps.fontFamily}`;
        ctx.fillText(
          this.drawOps.text,
          w - ctx.measureText(this.drawOps.text).width - 20,
          height - this.drawOps.size,
          width - 20
        );
        cb && cb(waterCanvas.toDataURL());
        waterCanvas = null;
        ctx = null;
      },
      [POSITION.full]: (width, height, cb) => {
        const angle = -30; // 按逆时针30度算
        const R = (angle * Math.PI) / 180;
        const font = `${this.drawOps.size}px ${this.drawOps.fontFamily}`;
        let waterCanvas = this.createCanvas(width, height);
        let ctx = waterCanvas.getContext('2d');
        ctx.font = font;
        const textW = ctx.measureText(this.drawOps.text).width + 40;
        let patternCanvas = this.createCanvas(
          this.drawOps.isRotate ? textW * Math.abs(Math.cos(R)) + this.drawOps.size : textW,
          this.drawOps.isRotate
            ? textW * Math.abs(Math.sin(R)) + this.drawOps.size
            : this.drawOps.size + 20
        );
        document.body.appendChild(patternCanvas);
        let ctxWater = patternCanvas.getContext('2d');
        ctxWater.textAlign = 'left';
        ctxWater.textBaseline = 'top';
        ctxWater.font = font;
        ctxWater.fillStyle = `${this.drawOps.color}`;
        if (this.drawOps.isRotate) {
          ctxWater.translate(0, textW * Math.abs(Math.sin(R)));
          ctxWater.rotate(R);
          ctxWater.fillText(this.drawOps.text, 0, 0);
        } else {
          ctxWater.fillText(this.drawOps.text, 10, 10);
        }
        ctx.fillStyle = ctx.createPattern(patternCanvas, 'repeat');
        ctx.fillRect(0, 0, width, height);
        cb && cb(waterCanvas.toDataURL());
        waterCanvas = null;
        patternCanvas = null;
        ctx = null;
        ctxWater = null;
      },
    };
    this.init();
  }
  createCanvas(width, height) {
    const waterCanvas = document.createElement('canvas');
    waterCanvas.width = width;
    waterCanvas.height = height;
    waterCanvas.style.position = 'fixed';
    waterCanvas.style.opacity = '0';
    waterCanvas.style.zIndex = '-1';
    return waterCanvas;
  }
  drawWaterMark(ops) {
    var _a;
    this.drawOps = Object.assign(cloneDeep(this.drawOps), ops);
    if (!this.drawOps.text) return;
    const workspace = this.canvas.getObjects().find((item) => item.id === 'workspace');
    const { width, height, left, top } = workspace;
    this.drawing[(_a = this.drawOps) === null || _a === void 0 ? void 0 : _a.position](
      width,
      height,
      (imgString) => {
        this.canvas.overlayImage = undefined;
        this.hadDraw = true;
        this.canvas.setOverlayImage(imgString, this.canvas.renderAll.bind(this.canvas), {
          left: left || 0,
          top: top || 0,
          originX: 'left',
          originY: 'top',
        });
      }
    );
  }
  // 更新handDrow 导入json时无法知道是否绘制
  updateDrawStatus(status) {
    this.hadDraw = status;
  }
  clearWaterMMatk() {
    if (!this.hadDraw) return;
    this.canvas.overlayImage = undefined;
    this.canvas.renderAll();
    this.hadDraw = false;
    this.drawOps = defaultOptions;
  }
  init() {
    this.editor.on('sizeChange', this.drawWaterMark.bind(this));
  }
  destroy() {
    this.editor.off('sizeChange', this.drawWaterMark);
  }
}
WaterMarkPlugin.pluginName = 'WaterMarkPlugin';
WaterMarkPlugin.apis = ['drawWaterMark', 'clearWaterMMatk', 'updateDrawStatus'];
export default WaterMarkPlugin;
