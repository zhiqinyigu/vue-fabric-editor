/**
 * jest 测试环境初始化（testEnvironment: 'node'）
 * - 手动搭建 jsdom 全局（fabric 需要 window/document/navigator）
 * - 拦截原生 canvas 模块（jsdom 依赖但未编译）
 * - mock canvas 2D 上下文（fabric 文本测量依赖）
 */
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'canvas') {
    // 与 jest moduleNameMapper 共用同一份 stub（含 jsdom 需要的 Canvas.Image）
    return require('./__mocks__/canvas');
  }
  return origLoad.apply(this, arguments);
};

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLDocument = dom.window.HTMLDocument;
global.Document = dom.window.Document;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Image = dom.window.Image;
global.getComputedStyle = dom.window.getComputedStyle;
global.MouseEvent = dom.window.MouseEvent;

// Editor 链路（FlipPlugin → language/index）读取 localStorage；node 环境补内存版。
// 注意：JSDOM opaque origin 下访问 window.localStorage 会抛 SecurityError，故直接挂 global
const lsStore = new Map();
global.localStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
  clear: () => lsStore.clear(),
};

// 兜底：若 jsdom 未暴露 HTMLCanvasElement，构造一个（让 fabric 测量可用）
const CanvasCtor =
  (dom.window.HTMLCanvasElement && dom.window.HTMLCanvasElement) ||
  class HTMLCanvasElement extends dom.window.HTMLElement {};
if (!dom.window.HTMLCanvasElement) {
  dom.window.HTMLCanvasElement = CanvasCtor;
}
global.HTMLCanvasElement = CanvasCtor;

function makeCtx() {
  return {
    canvas: { getAttribute: () => 'ltr', setAttribute() {} },
    measureText: (t) => ({ width: String(t).length * 200 }),
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
    bezierCurveTo() {},
    quadraticCurveTo() {},
    arcTo() {},
    ellipse() {},
    setTransform() {},
    setLineDash() {},
    fillText() {},
    strokeText() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {},
    drawImage() {},
    set fillStyle(v) {},
    get fillStyle() {
      return '';
    },
    set strokeStyle(v) {},
    get strokeStyle() {
      return '';
    },
    set font(v) {},
    get font() {
      return '';
    },
    set textAlign(v) {},
    get textAlign() {
      return 'left';
    },
    set textBaseline(v) {},
    get textBaseline() {
      return 'alphabetic';
    },
    set globalAlpha(v) {},
    get globalAlpha() {
      return 1;
    },
    set lineWidth(v) {},
    get lineWidth() {
      return 1;
    },
  };
}

CanvasCtor.prototype.getContext = function () {
  return makeCtx();
};
CanvasCtor.prototype.toDataURL = function () {
  return 'data:image/png;base64,';
};
