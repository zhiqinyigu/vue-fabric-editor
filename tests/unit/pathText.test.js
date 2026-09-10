import { fabric } from 'fabric';
import PathTextPlugin from '../../src/core/plugin/PathTextPlugin';

function makeCanvas() {
  const handlers = {};
  return {
    isDrawingMode: false,
    freeDrawingBrush: null,
    objects: [],
    on(name, cb) {
      (handlers[name] = handlers[name] || []).push(cb);
    },
    off(name, cb) {
      const arr = handlers[name] || [];
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    },
    add(obj) {
      this.objects.push(obj);
      this.added = obj;
    },
    remove(obj) {
      const i = this.objects.indexOf(obj);
      if (i >= 0) this.objects.splice(i, 1);
      this.removed = obj;
    },
    fire(name, opt) {
      (handlers[name] || []).forEach((cb) => cb(opt));
    },
    requestRenderAll() {},
  };
}

function drawFreePath(canvas, plugin, onCreated) {
  plugin.startTextPathDraw({ onCreated });
  const path = new fabric.Path([['M', 0, 0], ['L', 100, 0]], {
    fill: null,
    stroke: '#000000',
    strokeWidth: 2,
  });
  path.segmentsInfo = fabric.util.getPathSegmentsInfo(path.path);
  canvas.fire('before:path:created', { path });
  canvas.fire('path:created', { path });
  return path;
}

// 记录渲染调用的 ctx（用于定位首字符绝对坐标）
function recordingCtx() {
  const calls = [];
  return {
    canvas: { getAttribute: () => 'ltr', setAttribute() {} },
    measureText: (t) => ({ width: String(t).length * 200 }),
    calls,
    save() { calls.push(['save']); }, restore() { calls.push(['restore']); },
    translate(x, y) { calls.push(['translate', x, y]); }, rotate(a) { calls.push(['rotate', a]); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, arc() {}, arcTo() {},
    fillText() { calls.push(['fillText']); }, strokeText() {},
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set font(v) {}, get font() { return ''; },
    set textAlign(v) {}, get textAlign() { return 'left'; },
    set textBaseline(v) {}, get textBaseline() { return 'alphabetic'; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
    rect() {}, transform() {}, scale() {}, setTransform() {}, setLineDash() {},
    createLinearGradient: () => ({ addColorStop() {} }), createPattern: () => ({}),
  };
}

function firstCharAbs(tb) {
  tb.objectCaching = false;
  tb.initDimensions();
  const ctx = recordingCtx();
  tb.render(ctx);
  let recent = [];
  let firstFill = null;
  for (const c of ctx.calls) {
    if (c[0] === 'translate') recent = c.slice(1);
    if (c[0] === 'fillText' && firstFill === null) firstFill = recent;
  }
  const m = tb.calcTransformMatrix();
  return { x: m[4] + firstFill[0], y: m[5] + firstFill[1] };
}

// 复刻 attributeTextContent.applyPath 的替换逻辑
function replacePath(textObj, d) {
  const parsed = fabric.util.parsePath(d);
  const path = textObj.path;
  const curLeft = textObj.left;
  const curTop = textObj.top;
  path._setPath(parsed);
  const dx = curLeft - path.left;
  const dy = curTop - path.top;
  if (dx || dy) {
    const shifted = path.path.map((seg) =>
      seg.map((v, idx) => (idx === 0 ? v : typeof v === 'number' ? v + (idx % 2 === 1 ? dx : dy) : v))
    );
    path._setPath(shifted);
  }
  textObj.setPathInfo(); // 重算 segmentsInfo（initDimensions 不会重算）
  textObj.set({ left: path.left, top: path.top });
  textObj.initDimensions();
  textObj.setCoords();
}

describe('PathTextPlugin 路径文字', () => {
  it('startTextPathDraw 后绘制路径：生成挂在路径上的 IText，自动结束绘制模式并回调', () => {
    const canvas = makeCanvas();
    const plugin = new PathTextPlugin(canvas, null);
    let created = null;
    plugin.startTextPathDraw({ onCreated: (t) => { created = t; } });
    expect(canvas.isDrawingMode).toBe(true);
    const path = new fabric.Path([['M', 0, 0], ['L', 100, 0]], {
      fill: null,
      stroke: '#000000',
      strokeWidth: 2,
    });
    path.segmentsInfo = fabric.util.getPathSegmentsInfo(path.path);
    canvas.fire('before:path:created', { path });
    canvas.fire('path:created', { path });
    expect(created).toBeTruthy();
    expect(created.type).toBe('i-text');
    expect(created.get('text')).toBe('诸事顺遂 万事大吉');
    expect(created.editable).toBe(false);
    expect(canvas.added).toBe(created);
    expect(canvas.isDrawingMode).toBe(false); // 绘制完成自动结束
    expect(plugin.options).toBeNull(); // 配置已清理
  });

  it('endTextPathDraw 未启动时调用不报错', () => {
    const canvas = makeCanvas();
    const plugin = new PathTextPlugin(canvas, null);
    plugin.endTextPathDraw();
    expect(canvas.isDrawingMode).toBe(false);
  });

  it('自动平滑：brush.convertPointsToSVGPath 输出 C 段平滑路径并简化抖动点', () => {
    const canvas = makeCanvas();
    const plugin = new PathTextPlugin(canvas, null);
    plugin.startTextPathDraw({});
    const brush = canvas.freeDrawingBrush;
    expect(brush).toBeTruthy();
    // 沿一条平缓曲线采样 41 点，叠加 1px 手抖
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const jitter = i % 3 === 0 ? 1 : 0;
      points.push(new fabric.Point(i * 5, 0.05 * i * i + jitter));
    }
    const pathData = brush.convertPointsToSVGPath(points);
    expect(pathData).toBeTruthy();
    expect(pathData[0][0]).toBe('M');
    // 平滑路径以三次贝塞尔为主
    expect(pathData.some((seg) => seg[0] === 'C')).toBe(true);
    // 点被简化：分段数明显少于原始 41 点
    expect(pathData.length).toBeLessThan(30);
  });

  it('序列化：IText.fromObject 恢复后 path 是 fabric.Path 且 editable 保留', (done) => {
    const canvas = makeCanvas();
    const plugin = new PathTextPlugin(canvas, null);
    let created = null;
    drawFreePath(canvas, plugin, (t) => { created = t; });
    const json = JSON.stringify(created.toObject());
    fabric.IText.fromObject(JSON.parse(json), (restored) => {
      expect(restored.type).toBe('i-text');
      expect(restored.path).toBeInstanceOf(fabric.Path); // 不再退化为普通对象
      expect(restored.path.path.length).toBeGreaterThan(0);
      expect(restored.editable).toBe(false); // 不再丢失
      done();
    });
  });

  it('替换路径：_setPath 后 initDimensions 重排文本（segmentsInfo 更新）', () => {
    const canvas = makeCanvas();
    const plugin = new PathTextPlugin(canvas, null);
    let created = null;
    drawFreePath(canvas, plugin, (t) => { created = t; });
    const before = created.path.path.slice();
    const newData = fabric.util.parsePath('M 0 100 C 30 120 70 160 120 80');
    created.path._setPath(newData);
    created.initDimensions();
    created.setCoords();
    // 路径数据已替换且 segmentsInfo 随之重算
    expect(created.path.path).not.toEqual(before);
    expect(created.path.segmentsInfo).toBeDefined();
    expect(created.path.segmentsInfo.length).toBeGreaterThan(0);
  });

  it('替换路径：文本保持位置且从新路径起点开始（修复起点偏移）', () => {
    const d = 'm 8.946 9.158 c 94.822 378.133,381.024 134.717,494.348 488.567';
    const oldPath = new fabric.Path([['M', 0, 0], ['L', 100, 0]], { fill: null, stroke: '#000', strokeWidth: 2 });
    oldPath.segmentsInfo = fabric.util.getPathSegmentsInfo(oldPath.path);
    const tb = new fabric.IText('hello', { fontSize: 20, top: 300, left: 400, path: oldPath });
    tb.initDimensions();
    const oldLeft = tb.left;
    const oldTop = tb.top;
    replacePath(tb, d);
    // 位置保持（text.left == path.left == 原位置）
    expect(tb.left).toBeCloseTo(oldLeft, 3);
    expect(tb.top).toBeCloseTo(oldTop, 3);
    expect(tb.path.left).toBeCloseTo(tb.left, 3);
    expect(tb.path.top).toBeCloseTo(tb.top, 3);
    // 首字符与路径 M 点对齐（半字宽内，mock 字宽 10px）
    const mAbs = fabric.util.transformPoint(
      new fabric.Point(tb.path.path[0][1] - tb.path.pathOffset.x, tb.path.path[0][2] - tb.path.pathOffset.y),
      tb.path.calcTransformMatrix()
    );
    const c = firstCharAbs(tb);
    const dist = Math.hypot(c.x - mAbs.x, c.y - mAbs.y);
    expect(dist).toBeLessThan(15);
  });
});

