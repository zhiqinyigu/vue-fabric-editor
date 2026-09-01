// canvas 原生模块的 jest stub（jsdom 依赖，但测试环境无需真实实现）
const ctx = {
  canvas: { getAttribute: () => 'ltr', setAttribute() {} },
  measureText: () => ({ width: 0 }),
  save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  fill() {}, closePath() {}, translate() {}, rotate() {}, scale() {}, transform() {},
  fillRect() {}, strokeRect() {}, clearRect() {}, clip() {}, rect() {}, arc() {},
  setTransform() {}, setLineDash() {}, fillText() {}, strokeText() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createPattern: () => ({}),
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {}, drawImage() {},
};
module.exports = {
  createCanvas: () => ({
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBuffer: () => Buffer.alloc(0),
  }),
};
