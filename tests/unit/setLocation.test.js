import { SvgPath } from 'svg-path-editor-lib';

describe('setLocation 连续拖拽（复现组件流程）', () => {
  it('同一捕获 ref 多次 setLocation 应持续移动（模拟拖拽多次 move）', () => {
    const sp = new SvgPath('M 30 60 L 100 30 L 150 90');
    const anchorRef = sp.targetLocations()[1]; // 捕获锚点1
    const pts = [
      { x: 564.1, y: 469.9 },
      { x: 564.1, y: 470.7 },
      { x: 564.1, y: 471.0 },
      { x: 564.1, y: 473.0 },
      { x: 564.1, y: 475.2 },
    ];
    for (const pt of pts) {
      sp.setLocation(anchorRef, pt);
      sp.refreshAbsolutePositions();
      const cur = sp.targetLocations()[1];
      console.log(`setLocation -> ${pt.y}  现目标 y=${cur.y}  ${Math.abs(cur.y - pt.y) < 0.01 ? 'OK' : 'STUCK'}`);
    }
    expect(sp.targetLocations()[1].y).toBeCloseTo(475.2, 4);
  });
});
