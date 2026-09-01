/**
 * CustomTextbox（textbox 尺寸锁 / 省略号 / 自定义手柄）单元测试
 */
import { fabric } from 'fabric';
import '../../src/core/objects/CustomTextbox';

const TEXT = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee';

function makeCtx() {
  const ctx = {
    canvas: { getAttribute: () => 'ltr', setAttribute() {} },
    measureText: (t) => ({ width: String(t).length * 200 }),
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, closePath() {}, translate() {}, rotate() {}, scale() {}, transform() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, rect() {}, arc() {},
    setTransform() {}, setLineDash() {}, fillText() {}, strokeText() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData() {}, drawImage() {},
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set strokeStyle(v) {}, get strokeStyle() { return ''; },
    set font(v) {}, get font() { return ''; },
    set textAlign(v) {}, get textAlign() { return 'left'; },
    set textBaseline(v) {}, get textBaseline() { return 'alphabetic'; },
    set globalAlpha(v) {}, get globalAlpha() { return 1; },
    set lineWidth(v) {}, get lineWidth() { return 1; },
  };
  ctx.clip = jest.fn();
  ctx.rect = jest.fn();
  return ctx;
}

function makeTransform(tb, corner, originX, originY, x, y) {
  tb.canvas = { getZoom: () => 1, fire: () => {} };
  return { target: tb, corner, originX, originY, offsetX: 0, offsetY: 0, x, y };
}

// 记录 canvas 事件的 mock 画布
function makeEventCanvas(events) {
  return {
    getZoom: () => 1,
    fire: (name) => events.push(name),
  };
}

describe('textbox 尺寸锁 / 省略号 / 自定义手柄', () => {
  it('自定义控制手柄已注册（直接改宽高，非缩放）', () => {
    const tb = new fabric.Textbox('hi', { width: 100, fontSize: 20 });
    expect(tb.controls.ml).toBeTruthy();
    expect(tb.controls.mr).toBeTruthy();
    expect(tb.controls.mt).toBeTruthy();
    expect(tb.controls.mb).toBeTruthy();
    expect(tb.controls.tl).toBeTruthy();
    expect(tb.controls.tr).toBeTruthy();
    expect(tb.controls.bl).toBeTruthy();
    expect(tb.controls.br).toBeTruthy();
    expect(tb.controls.mtr).toBeTruthy(); // 旋转手柄保留
  });

  it('clip 开启时 _render 手动裁剪到 [±w/2, ±h/2]', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20, left: 100, top: 100 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.initDimensions();
    tb.objectCaching = false; // 直接渲染到传入 ctx，验证 _render 裁剪
    const ctx = makeCtx();
    tb.render(ctx);
    const r = ctx.rect.mock.calls[ctx.rect.mock.calls.length - 1];
    expect(ctx.clip).toHaveBeenCalled();
    expect(r[0]).toBe(-tb.width / 2);
    expect(r[1]).toBe(-tb.height / 2);
    expect(r[2]).toBe(tb.width);
    expect(r[3]).toBe(tb.height);
  });

  it('frameHeight 初始化与 setFrameHeight / initDimensions 保持', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    expect(tb.frameHeight).toBeGreaterThan(0);
    tb.setFrameHeight(40);
    expect(tb.frameHeight).toBe(40);
    expect(tb.height).toBe(40);
    tb.initDimensions();
    expect(tb.height).toBe(40);
  });

  it('省略号：frame 放不下时 _textLines 真正截断，末可见行含 "..."', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(44); // 约 1.9 行 → 仅 1 行
    tb.initDimensions();
    expect(tb._textLines.length).toBe(1);
    expect(tb._textLines[0].includes('...')).toBe(true);
  });

  it('省略号：frame 能放 2 整行 → 截断为 2 行，省略号在第 2 行', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(60); // 实际行高约 26.2 → 2 行 = 52.4 ≤ 60
    tb.initDimensions();
    expect(tb._textLines.length).toBe(2);
    expect(tb._textLines[1].includes('...')).toBe(true);
    expect(tb._textLines[0].includes('...')).toBe(false);
  });

  it('省略号关闭后 _textLines 恢复完整文本', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(60);
    tb.initDimensions();
    expect(tb._textLines.length).toBe(2);
    tb.set({ ellipsisEnabled: false });
    tb.initDimensions();
    expect(tb._textLines.length).toBe(5);
    expect(JSON.stringify(tb._textLines).includes('...')).toBe(false);
  });

  it('省略号：末行未排满时直接追加 "..."，不截断字符（如 "current assets..." 而非 "current ass..."）', () => {
    // 3 行："aaaaaaaaaa" | "cc" | "bbbbbbbbbb"；frame 只放 2 行 → 末可见行是短行 "cc"
    const text = 'aaaaaaaaaa cc bbbbbbbbbb';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(60); // 恰好 2 行
    tb.initDimensions();
    const lines = tb._textLines.map((l) => l.join(''));
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('aaaaaaaaaa');
    expect(lines[1]).toBe('cc...'); // "cc" + "..." 直接放得下，无需弹出字符
  });

  it('clip 关闭：无裁剪、frameHeight 复位', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.set({ clipEnabled: false });
    tb.syncFrame();
    expect(tb.frameHeight).toBeNull();
    const ctx = makeCtx();
    tb.render(ctx);
    expect(ctx.rect).not.toHaveBeenCalled();
  });

  it('clip 关闭拖右上角：top/left 不变，仅宽度变化', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20, left: 100, top: 100 });
    tb.set({ clipEnabled: false });
    tb.initDimensions();
    const topBefore = tb.top;
    const leftBefore = tb.left;
    const wBefore = tb.width;
    const tr = makeTransform(tb, 'tr', 'left', 'bottom', 250, 100);
    tb.controls.tr.actionHandler(tr, tr, 250, 100);
    expect(tb.top).toBe(topBefore);
    expect(tb.left).toBe(leftBefore);
    expect(tb.width).toBeGreaterThan(wBefore);
  });

  it('超长单词（clip 开启）按字符断行，box 不撑宽', () => {
    const word = 'aaaaaaaaaaaaaaaaaaaaaaaaa'; // 25 字符，宽约 250 > frame 100
    const tb = new fabric.Textbox(word, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(200); // 足够放多行，验证断行而非竖向省略号
    tb.initDimensions();
    expect(tb.width).toBe(100); // 不被超长单词撑宽
    expect(tb._textLines.length).toBeGreaterThan(1); // 断成多行
  });

  it('普通段落按词边界换行，不逐字断行', () => {
    const paragraph =
      'In English vernacular cash refers to money in the physical form of currency such as banknotes and coins';
    // 单词均短于 frame 宽度（frame 较宽）
    const tb = new fabric.Textbox(paragraph, { width: 400, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(400);
    tb.initDimensions();
    // 任意行不应出现"单词被从中间切开"（行首/行尾不含被断开的词内字符组合过于随意的情况）
    // 校验：不存在因逐字断行产生的"以非空格开头、且上一行末尾也是非空格"的切分过多
    // 简化校验：总行数应远小于逐字断行的行数（逐字断行约 400/10=40 行）
    expect(tb._textLines.length).toBeLessThan(25);
    // 每个单词内部不被拆散：检查没有行以某单词的中间字符结尾（用字符数≤词长判断）
    const joined = tb._textLines.map((l) => l.join(''));
    // 逐字断行时会有很多以"非单词结尾"的短行；词边界换行时行数少且多为完整单词
    expect(joined.every((l) => l.length > 1)).toBe(true);
  });

  it('断行不丢失字符（总字符数一致）', () => {
    const word = 'abcdefghijklmnopqrstuvwxyz';
    const tb = new fabric.Textbox(word, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(200);
    tb.initDimensions();
    const total = tb._textLines.reduce((sum, line) => sum + line.length, 0);
    expect(total).toBe(word.length);
  });

  it('长段落 + 小 frame：末可见行补 "..."（水平省略号）', () => {
    const paragraph =
      'In English vernacular cash refers to money in the physical form of currency such as banknotes and coins ' +
      'In bookkeeping and finance cash refers to current assets comprising currency or currency equivalents ' +
      'Cash is seen either as a reserve for payments';
    const tb = new fabric.Textbox(paragraph, { width: 400, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(60); // 约 2 行
    tb.initDimensions();
    // 只保留能完整放下的行（此处约为 2 行），末可见行含 "..."
    expect(tb._textLines.length).toBeGreaterThan(0);
    expect(tb._textLines.length).toBeLessThan(paragraph.length); // 已截断
    expect(tb._textLines[tb._textLines.length - 1].includes('...')).toBe(true);
  });

  it('混合文本：短词保持完整按词边界换行，仅超宽单词断行', () => {
    // 框宽 100（约 10 字符）；"eeeeeeeeeee"(11) 超宽，其余短词均不超宽
    const text = 'aab cc dd eeeeeeeeeee fg hh';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(400);
    tb.initDimensions();
    const joined = tb._textLines.map((l) => l.join('')).join('|');
    // 短词必须保持完整
    expect(joined).toContain('aab');
    expect(joined).toContain('cc');
    expect(joined).toContain('dd');
    expect(joined).toContain('fg');
    expect(joined).toContain('hh');
    // 超宽单词被断行（拆成多段）
    expect(tb._textLines.length).toBeGreaterThan(2);
    // 且 box 未被撑宽
    expect(tb.width).toBe(100);
  });

  it('splitByGrapheme=true 时英文仍按词边界换行（行内含空格不逐字断行）', () => {
    // 复现线上问题：addTextBox 设置 splitByGrapheme:true，英文短词却被逐字拆开
    const text = 'aab cc dd eeeeeeeeeee fg hh';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20, splitByGrapheme: true });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(400);
    tb.initDimensions();
    const lines = tb._textLines.map((l) => l.join('')).join('|');
    // 短词必须完整，不得被逐字拆开
    expect(lines).toContain('aab');
    expect(lines).toContain('cc');
    expect(lines).toContain('dd');
    expect(lines).toContain('fg');
    expect(lines).toContain('hh');
    expect(lines).not.toMatch(/aab cc d\|/); // 不允许在 "d" 后强行断行
    expect(tb.width).toBe(100);
  });

  it('极矮 frame（连一行都放不下）时至少保留首行并补 "..."', () => {
    const text = 'aab cc dd eeeeeeeeeee fg hh';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(25); // 小于单行高
    tb.initDimensions();
    const lines = tb._textLines.map((l) => l.join(''));
    expect(lines.length).toBe(1); // 已截断为一行
    expect(lines[0].endsWith('...')).toBe(true); // 末行带省略号
    expect(tb.width).toBe(100);
  });

  it('超宽单词断行后，后续行不得以空格开头', () => {
    const text = 'aab cc dd eeeeeeeeeee fg hh';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(400);
    tb.initDimensions();
    const lines = tb._textLines.map((l) => l.join(''));
    const fgLine = lines.find((l) => l.includes('fg'));
    expect(fgLine).toBe('fg hh'); // 无前置空格
  });

  it('#2 仅编辑态展示完整文本，退出编辑恢复省略号；选中不编辑仍显示省略号', () => {
    const text = 'aab cc dd eeeeeeeeeee fg hh';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(40); // 只放得下一行 → 截断
    tb.initDimensions();
    const truncated = tb._textLines.map((l) => l.join(''));
    expect(truncated.some((l) => l.includes('...'))).toBe(true);
    expect(truncated.length).toBe(1);
    // 选中但不编辑：仍显示省略号
    tb.fire('selected');
    expect(tb._textLines.map((l) => l.join('')).some((l) => l.includes('...'))).toBe(true);
    tb.fire('deselected');
    // 编辑态：完整文本（省略号跳过）—— stub 光标定时器避免测试挂起
    tb.initDelayedCursor = () => {};
    tb.isEditing = true;
    tb.initDimensions();
    const full = tb._textLines.map((l) => l.join(''));
    expect(full.some((l) => l.includes('...'))).toBe(false);
    expect(full.length).toBeGreaterThan(1);
    expect(full.join('')).toContain('eeeeeeeeeee');
    // 退出编辑：恢复截断
    tb.isEditing = false;
    tb.initDimensions();
    const again = tb._textLines.map((l) => l.join(''));
    expect(again.length).toBe(1);
    expect(again[0].includes('...')).toBe(true);
  });

  it('#2 点击进入编辑前（_pendingEdit）用完整布局，计算后恢复截断', () => {
    const text = 'aab cc dd eeeeeeeeeee fg hh';
    const tb = new fabric.Textbox(text, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(40);
    tb.initDimensions();
    expect(tb._textLines[0].includes('...')).toBe(true);
    // 模拟点击已选中文本正文（mousedown→setCursorByClick）前：完整布局
    tb._pendingEdit = true;
    tb.initDimensions();
    expect(tb._textLines.map((l) => l.join('')).join('')).toContain('eeeeeeeeeee');
    // 光标计算完成、尚未进入编辑：恢复截断
    tb._pendingEdit = false;
    tb.initDimensions();
    expect(tb._textLines[0].includes('...')).toBe(true);
  });

  it('clip 开启拖角：对角锚点固定', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20, left: 100, top: 100 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    const oldTR = tb.translateToOriginPoint(tb.getCenterPoint(), 'right', 'top');
    const bl = makeTransform(tb, 'bl', 'right', 'top', 300, 200);
    tb.controls.bl.actionHandler(bl, bl, 300, 200);
    tb.initDimensions();
    const newTR = tb.translateToOriginPoint(tb.getCenterPoint(), 'right', 'top');
    expect(Math.abs(newTR.x - oldTR.x)).toBeLessThan(0.5);
    expect(Math.abs(newTR.y - oldTR.y)).toBeLessThan(0.5);
  });

  it('#4 旋转态拖拽：所有边/角手柄锚定对侧（角度 0/30/120/300）', () => {
    const cases = [
      ['ml', 'right', 'center', 60, 200],
      ['mr', 'left', 'center', 340, 200],
      ['mt', 'center', 'bottom', 200, 60],
      ['mb', 'center', 'top', 200, 340],
      ['bl', 'right', 'top', 340, 240],
      ['tr', 'left', 'bottom', 60, 60],
    ];
    for (const angle of [0, 30, 120, 300]) {
      for (const [handle, aOX, aOY, px, py] of cases) {
        const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20, left: 200, top: 200, angle });
        tb.set({ clipEnabled: true });
        tb.syncFrame();
        const oldAnchor = tb.translateToOriginPoint(tb.getCenterPoint(), aOX, aOY);
        const t = makeTransform(tb, handle, aOX, aOY, px, py);
        tb.controls[handle].actionHandler(t, t, px, py);
        tb.initDimensions();
        const newAnchor = tb.translateToOriginPoint(tb.getCenterPoint(), aOX, aOY);
        expect(Math.abs(newAnchor.x - oldAnchor.x)).toBeLessThan(0.5);
        expect(Math.abs(newAnchor.y - oldAnchor.y)).toBeLessThan(0.5);
      }
    }
  });

  it('序列化：frameHeight / clipEnabled / ellipsisEnabled 保留', () => {
    const tb = new fabric.Textbox(TEXT, {
      width: 100,
      fontSize: 20,
      clipEnabled: true,
      ellipsisEnabled: true,
      frameHeight: 40,
    });
    const obj = tb.toObject();
    expect(obj.type).toBe('textbox');
    expect(obj.frameHeight).toBe(40);
    expect(obj.clipEnabled).toBe(true);
    expect(obj.ellipsisEnabled).toBe(true);
  });

  it('非 clip 自动高度：水平拖左上角 top 不变（顶部固定、高度向下生长）', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20, left: 200, top: 200 });
    tb.initDimensions();
    const startTop = tb.top;
    for (let i = 0; i < 5; i++) {
      const px = 60 + i * 20;
      const t = makeTransform(tb, 'tl', 'right', 'top', px, 60);
      tb.controls.tl.actionHandler(t, t, px, 60);
      tb.initDimensions();
      expect(tb.top).toBeCloseTo(startTop, 5);
    }
  });

  it('角拖触发 object:resizing（供属性面板实时刷新）', () => {
    const events = [];
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20, left: 200, top: 200 });
    tb.set({ clipEnabled: true });
    tb.syncFrame();
    const t = makeTransform(tb, 'bl', 'right', 'top', 340, 240);
    tb.canvas = makeEventCanvas(events);
    tb.controls.bl.actionHandler(t, t, 340, 240);
    tb.initDimensions();
    expect(events).toContain('object:resizing');
  });

  it('#2 省略号状态只由编辑态决定：标志位被污染也不影响恢复截断', () => {
    const tb = new fabric.Textbox(TEXT, { width: 100, fontSize: 20 });
    tb.set({ clipEnabled: true, ellipsisEnabled: true });
    tb.syncFrame();
    tb.setFrameHeight(40);
    tb.initDimensions();
    expect(tb._textLines[0].includes('...')).toBe(true);
    // 模拟标志位被污染卡在 true（旧 bug：永不恢复省略号）
    tb._ellipsisSuspended = true;
    tb.initDimensions();
    const lines = tb._textLines.map((l) => l.join(''));
    expect(lines[0].includes('...')).toBe(true);
    expect(lines.length).toBe(1);
  });
});
