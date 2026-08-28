/**
 * SimpleClipImagePlugin 圆形裁切形状纯函数：
 * - 默认圆直径 = 显示宽高短边（内切圆）：方形/横图/竖图均裁到短边
 * - 圆形覆盖语义与转换器 legacy avatar 的纯 json clipPath 同口径
 */
import { fabric } from 'fabric';
import './../../src/core/renderPatches';
import { createCircleClipShapes } from './../../src/core/plugin/SimpleClipImagePlugin';

function center(x, y) {
  // 与真实调用方 activeObject.getCenterPoint() 同形状（fabric.Point {x,y}）
  return { x, y };
}

describe('createCircleClipShapes：默认 = 短边内切圆', () => {
  it.each([
    ['方形 100x100 → r=50', 100, 100, 50],
    ['横图 200x100 → r=50（短边）', 200, 100, 50],
    ['竖图 100x300 → r=50（短边）', 100, 300, 50],
    ['横图 400x300 → r=150', 400, 300, 150],
  ])('%s', (_name, w, h, expected) => {
    const { shell, clipPath } = createCircleClipShapes(w, h, center(100, 200));
    expect(shell).toBeInstanceOf(fabric.Ellipse);
    expect(clipPath).toBeInstanceOf(fabric.Ellipse);
    expect(shell.rx).toBe(expected);
    expect(shell.ry).toBe(expected);
    expect(shell.left).toBe(100);
    expect(shell.top).toBe(200);
    expect(clipPath.rx).toBe(expected);
    expect(clipPath.ry).toBe(expected);
    expect(clipPath.absolutePositioned).toBe(true);
    expect(clipPath.inverted).toBe(false);
    expect(clipPath.originX).toBe('center');
    expect(clipPath.originY).toBe('center');
  });

  it('inverted 变体透传', () => {
    const { shell, clipPath } = createCircleClipShapes(100, 100, center(0, 0), true);
    expect(shell.inverted).toBe(false);
    expect(clipPath.inverted).toBe(true);
  });

  it('shell 形状入参（{left,top}）同样得正确圆心（防坐标形状各自失衡）', () => {
    const { shell, clipPath } = createCircleClipShapes(200, 100, { left: 30, top: 40 });
    expect(shell.left).toBe(30);
    expect(shell.top).toBe(40);
    expect(clipPath.left).toBe(30);
    expect(clipPath.top).toBe(40);
  });
});
