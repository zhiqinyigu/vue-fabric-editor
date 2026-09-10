import { SvgPath } from 'svg-path-editor-lib';

// 复刻 PathEditorDialog 的拖拽逻辑（不含 Vue/DOM rect 映射，直接以路径坐标模拟）
function makeDragHarness() {
  const sp = new SvgPath('M 0 0 L 100 0 L 100 100');
  let anchors = sp.targetLocations().map((p) => ({ x: p.x, y: p.y, ref: p }));
  let controls = sp.controlLocations().map((c) => ({ x: c.x, y: c.y, ref: c }));
  let drag = null;
  let lastX = 0;
  let lastY = 0;

  function refresh() {
    anchors = sp.targetLocations().map((p) => ({ x: p.x, y: p.y, ref: p }));
    controls = sp.controlLocations().map((c) => ({ x: c.x, y: c.y, ref: c }));
  }

  return {
    sp,
    get anchors() {
      return anchors;
    },
    get controls() {
      return controls;
    },
    pointerDown(x, y, kind, idx) {
      const arr = kind === 'anchor' ? anchors : controls;
      const handle = arr[idx];
      if (!handle) return;
      lastX = x;
      lastY = y;
      drag = { ref: handle.ref, moved: false, latestPt: { x, y } };
    },
    pointerMove(x, y) {
      if (!drag) return;
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      if (drag.ref && drag.moved) {
        drag.latestPt = { x, y };
        sp.setLocation(drag.ref, drag.latestPt);
        refresh();
      }
    },
    pointerUp() {
      if (!drag) return;
      if (drag.ref && drag.moved) {
        sp.setLocation(drag.ref, drag.latestPt);
        refresh();
      }
      drag = null;
    },
  };
}

describe('拖拽逻辑（逻辑级复现）', () => {
  it('锚点拖拽：按下后移动 >2px 即更新位置', () => {
    const h = makeDragHarness();
    const before = h.anchors[1].x;
    h.pointerDown(100, 0, 'anchor', 1);
    // 仅 1px 抖动（点击）：不移动
    h.pointerMove(101, 0);
    expect(h.anchors[1].x).toBeCloseTo(before);
    // 真实拖拽 50px
    h.pointerMove(150, 20);
    expect(h.anchors[1].x).toBeCloseTo(150);
    expect(h.anchors[1].y).toBeCloseTo(20);
    h.pointerUp();
  });

  it('锚点拖拽：连续多次移动，最终位置等于最后一次指针位置', () => {
    const h = makeDragHarness();
    h.pointerDown(100, 0, 'anchor', 1);
    h.pointerMove(120, 10);
    h.pointerMove(140, 30);
    h.pointerMove(160, 50);
    h.pointerUp();
    expect(h.anchors[1].x).toBeCloseTo(160);
    expect(h.anchors[1].y).toBeCloseTo(50);
  });

  it('控制点拖拽：拖动 C 控制点后控制点位置更新', () => {
    const sp2 = new SvgPath('M 0 0 C 0 100 100 100 100 0');
    const h2 = {
      sp: sp2,
      anchors: null,
      controls: null,
      refresh() {
        this.controls = sp2.controlLocations();
      },
    };
    h2.refresh();
    const ref = h2.controls[0];
    const before = { x: ref.x, y: ref.y };
    sp2.setLocation(ref, { x: 25, y: 90 });
    const after = sp2.controlLocations()[0];
    expect(after.x).toBeCloseTo(25);
    expect(after.y).toBeCloseTo(90);
    expect(before.x).not.toBeCloseTo(after.x);
  });
});
