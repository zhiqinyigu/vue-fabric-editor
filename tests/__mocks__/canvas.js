// canvas 原生模块的 jest stub（jsdom 依赖，但测试环境无需真实实现）
const ctx = {
  canvas: { getAttribute: () => 'ltr', setAttribute() {} },
  measureText: () => ({ width: 0 }),
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  stroke() {},
  fill() {},
  closePath() {},
  translate() {},
  rotate() {},
  scale() {},
  transform() {},
  fillRect() {},
  strokeRect() {},
  clearRect() {},
  clip() {},
  rect() {},
  arc() {},
  setTransform() {},
  setLineDash() {},
  fillText() {},
  strokeText() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createPattern: () => ({}),
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {},
  drawImage() {},
};
// jsdom 在 <img> 设置 src / width / height 时会 `new Canvas.Image()`，并读取
// naturalWidth / naturalHeight（见 jsdom HTMLImageElement-impl.js 的 _updateTheImageData）。
// mock 不真实加载图片：尺寸恒为 0、不触发 onload / onerror，
// 避免 jsdom 抛 "TypeError: Canvas.Image is not a constructor"。
class Image {
  constructor() {
    this.width = 0;
    this.height = 0;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.complete = false;
    this.onload = null;
    this.onerror = null;
    this._src = '';
  }
  addEventListener() {}
  removeEventListener() {}
  get src() {
    return this._src;
  }
  set src(value) {
    this._src = value;
  }
}

module.exports = {
  createCanvas: () => ({
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBuffer: () => Buffer.alloc(0),
  }),
  Image,
};
