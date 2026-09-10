import { SvgPath } from 'svg-path-editor-lib';
import { sampleItem, nearestOnPath, splitItem, cubicAt } from '../../src/utils/svgPathMath';

describe('svgPathMath 路径编辑器几何', () => {
  it('sampleItem：L 线段线性采样', () => {
    const sp = new SvgPath('M 0 0 L 100 0');
    const pts = sampleItem(sp.path[1], 4);
    expect(pts.length).toBe(5);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[2].x).toBeCloseTo(50);
    expect(pts[4].x).toBeCloseTo(100);
  });

  it('sampleItem：C 贝塞尔端点与采样', () => {
    const sp = new SvgPath('M 0 0 C 0 100 100 100 100 0');
    const pts = sampleItem(sp.path[1], 8);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(0);
    expect(pts[8].x).toBeCloseTo(100);
    expect(pts[8].y).toBeCloseTo(0);
    // 中点应位于曲线中段
    expect(pts[4].y).toBeGreaterThan(30);
  });

  it('sampleItem：A 椭圆弧采样不抛错且中点落在圆弧上', () => {
    const sp = new SvgPath('M 0 0 A 50 50 0 0 1 100 0');
    const pts = sampleItem(sp.path[1], 8);
    expect(pts.length).toBe(9);
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[8].x).toBeCloseTo(100);
    // 中点距圆心 (50,0) 约 50（半圆，方向与 sweep 一致即可）
    const d = Math.hypot(pts[4].x - 50, pts[4].y - 0);
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(55);
  });

  it('nearestOnPath：命中对应线段', () => {
    const sp = new SvgPath('M 0 0 L 100 0 L 100 100');
    const hit = nearestOnPath(sp.path, { x: 100, y: 50 }, 16);
    expect(hit).toBeTruthy();
    expect(hit.itemIndex).toBe(2); // 第二条线段
    expect(hit.t).toBeCloseTo(0.5, 1);
  });

  it('splitItem：L 拆分为两段，几何保持', () => {
    const sp = new SvgPath('M 0 0 L 100 0 L 0 100');
    expect(splitItem(sp, 1, 0.5)).toBe(true);
    const segs = sp.path.map((it) => it.getType(true));
    expect(segs).toEqual(['M', 'L', 'L', 'L']);
    // 拆出的中间点应在原线段上
    const mid = sp.path[1].targetLocation();
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(0);
  });

  it('splitItem：C 拆分为两段 C，中点在原曲线上', () => {
    const sp = new SvgPath('M 0 0 C 0 100 100 100 100 0 L 200 0');
    const t = 0.5;
    const expectedMid = cubicAt(
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      t
    );
    expect(splitItem(sp, 1, t)).toBe(true);
    const types = sp.path.map((it) => it.getType(true));
    expect(types).toEqual(['M', 'C', 'C', 'L']);
    const mid = sp.path[1].targetLocation();
    expect(mid.x).toBeCloseTo(expectedMid.x, 4);
    expect(mid.y).toBeCloseTo(expectedMid.y, 4);
    // 末端保持
    const end = sp.path[2].targetLocation();
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(0);
  });

  it('splitItem：A 不支持拆分，返回 false', () => {
    const sp = new SvgPath('M 0 0 A 50 50 0 0 1 100 0');
    expect(splitItem(sp, 1, 0.5)).toBe(false);
  });

  it('拖拽链路：捕获的 ref 跨 refresh 后 setLocation 仍生效（锚点与控制点）', () => {
    const sp = new SvgPath('M 0 0 C 0 100 100 100 100 0');
    const anchorRef = sp.targetLocations()[1]; // C 末端锚点
    const ctrlRef = sp.controlLocations()[0]; // 第一个控制点
    // 模拟组件 refresh：重新生成 targetLocations/controlLocations
    sp.refreshAbsolutePositions();
    sp.setLocation(anchorRef, { x: 200, y: 50 });
    sp.refreshAbsolutePositions();
    expect(sp.targetLocations()[1].x).toBeCloseTo(200);
    expect(sp.targetLocations()[1].y).toBeCloseTo(50);
    sp.setLocation(ctrlRef, { x: 20, y: 80 });
    expect(sp.controlLocations()[0].x).toBeCloseTo(20);
    expect(sp.controlLocations()[0].y).toBeCloseTo(80);
  });

  it('空路径可构造并 asString 为空（清空输入用）', () => {
    const sp = new SvgPath('');
    expect(sp.path.length).toBe(0);
    expect(sp.asString(4)).toBe('');
  });
});
