/*
 * @Author: cyc
 * @Date: 2026-09-10 18:49:20
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 18:49:20
 * @Description: SVG 路径几何计算工具（路径文本/裁剪等共用）
 */

import { SvgItem } from 'svg-path-editor-lib';

/**
 * SVG path 编辑器用到的纯几何辅助：
 * 线段采样、路径最近点、贝塞尔/线段拆分（供 PathEditorDialog 使用）
 */

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

export function quadAt(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

// SVG 椭圆弧上参数 t 处的点（中心参数化，F.6.5）
export function arcPoint(start, end, rx, ry, rotDeg, largeArc, sweep, t) {
  const x1 = start.x;
  const y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;
  const phi = (rotDeg * Math.PI) / 180;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  let rx1 = Math.abs(rx);
  let ry1 = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx1 * rx1) + (y1p * y1p) / (ry1 * ry1);
  if (lambda > 1) {
    rx1 *= Math.sqrt(lambda);
    ry1 *= Math.sqrt(lambda);
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num = Math.max(0, rx1 * rx1 * ry1 * ry1 - rx1 * rx1 * y1p * y1p - ry1 * ry1 * x1p * x1p);
  const den = rx1 * rx1 * y1p * y1p + ry1 * ry1 * x1p * x1p;
  const coef = sign * Math.sqrt(den ? num / den : 0);
  const cxp = coef * ((rx1 * y1p) / ry1);
  const cyp = coef * ((-ry1 * x1p) / rx1);
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  const ux = (x1p - cxp) / rx1;
  const uy = (y1p - cyp) / ry1;
  const vx = (-x1p - cxp) / rx1;
  const vy = (-y1p - cyp) / ry1;
  const theta1 = Math.atan2(uy, ux);
  let dTheta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  const th = theta1 + dTheta * t;
  const px = rx1 * Math.cos(th);
  const py = ry1 * Math.sin(th);
  return {
    x: cx + cosP * px - sinP * py,
    y: cy + sinP * px + cosP * py,
  };
}

// 采样单条线段（item），返回 [start..end] 的 steps 个点
export function sampleItem(item, steps = 24) {
  const pts = [];
  const type = item.getType(true).toUpperCase();
  if (type === 'M') {
    return pts;
  }
  const start = item.previousPoint;
  const end = item.targetLocation();
  const push = (t) => {
    let p;
    switch (type) {
      case 'L':
      case 'H':
      case 'V':
        p = { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
        break;
      case 'C':
      case 'S': {
        const c = item.absoluteControlPoints;
        p = cubicAt(start, c[0], c[1], end, t);
        break;
      }
      case 'Q':
      case 'T': {
        const c = item.absoluteControlPoints[0];
        p = quadAt(start, c, end, t);
        break;
      }
      case 'A': {
        const v = item.values;
        p = arcPoint(start, end, v[0], v[1], v[2], !!v[3], !!v[4], t);
        break;
      }
      default:
        p = { x: start.x, y: start.y };
    }
    pts.push(p);
  };
  for (let i = 0; i <= steps; i++) {
    push(i / steps);
  }
  return pts;
}

// 在整个路径上找距离 point 最近的点，返回 { itemIndex, t, point }
// 默认跳过 A/M（A 不支持拆分）；菜单取线段时可传 { skipArc: false }
export function nearestOnPath(items, point, steps = 24, options = {}) {
  const skipArc = options.skipArc !== false;
  let best = null;
  let bestDist = Infinity;
  items.forEach((item, idx) => {
    const type = item.getType(true).toUpperCase();
    if (type === 'M' || (skipArc && type === 'A')) {
      return;
    }
    const pts = sampleItem(item, steps);
    pts.forEach((p, i) => {
      const d = (p.x - point.x) * (p.x - point.x) + (p.y - point.y) * (p.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        best = { itemIndex: idx, t: steps === 0 ? 0 : i / steps, point: p };
      }
    });
  });
  return best;
}

function cubicSplit(p0, p1, p2, p3, t) {
  const l1 = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
  const m = { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) };
  const r3 = { x: lerp(p2.x, p3.x, t), y: lerp(p2.y, p3.y, t) };
  const l2 = { x: lerp(l1.x, m.x, t), y: lerp(l1.y, m.y, t) };
  const r2 = { x: lerp(m.x, r3.x, t), y: lerp(m.y, r3.y, t) };
  const split = { x: lerp(l2.x, r2.x, t), y: lerp(l2.y, r2.y, t) };
  return {
    left: { p0, c1: l1, c2: l2, end: split },
    right: { p0: split, c1: r2, c2: r3, end: p3 },
  };
}

function quadSplit(p0, p1, p2, t) {
  const m = { x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t) };
  const r = { x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t) };
  const split = { x: lerp(m.x, r.x, t), y: lerp(m.y, r.y, t) };
  return {
    left: { p0, c1: m, end: split },
    right: { p0: split, c1: r, end: p2 },
  };
}

function makeC(c1, c2, end) {
  return SvgItem.Make(['C', c1.x, c1.y, c2.x, c2.y, end.x, end.y]);
}
function makeQ(c1, end) {
  return SvgItem.Make(['Q', c1.x, c1.y, end.x, end.y]);
}
function makeL(end) {
  return SvgItem.Make(['L', end.x, end.y]);
}

/**
 * 在 svgPath 的 path[itemIndex] 处按参数 t 拆分线段，
 * 用两个同类型命令替换原命令并刷新绝对坐标。
 * 支持 L/H/V/C/S/Q/T；A 返回 false（不拆分）。
 */
export function splitItem(svgPath, itemIndex, t) {
  const items = svgPath.path;
  if (itemIndex <= 0 || itemIndex >= items.length) {
    return false;
  }
  const item = items[itemIndex];
  let type = item.getType(true).toUpperCase();
  const start = item.previousPoint;
  const end = item.targetLocation();

  if (type === 'A') {
    return false;
  }
  // H/V 先转成 L 再拆
  if (type === 'H' || type === 'V') {
    const replaced = svgPath.changeType(item, 'L');
    if (!replaced) {
      return false;
    }
    const idx = svgPath.path.indexOf(replaced);
    return splitItem(svgPath, idx, t);
  }

  let leftItem;
  let rightItem;
  if (type === 'C' || type === 'S') {
    const c = item.absoluteControlPoints;
    const s = cubicSplit(start, c[0], c[1], end, t);
    leftItem = makeC(s.left.c1, s.left.c2, s.left.end);
    rightItem = makeC(s.right.c1, s.right.c2, s.right.end);
  } else if (type === 'Q' || type === 'T') {
    const c = item.absoluteControlPoints[0];
    const s = quadSplit(start, c, end, t);
    leftItem = makeQ(s.left.c1, s.left.end);
    rightItem = makeQ(s.right.c1, s.right.end);
  } else {
    // L
    const s = { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
    leftItem = makeL(s);
    rightItem = makeL(end);
  }

  items.splice(itemIndex, 1, leftItem, rightItem);
  svgPath.refreshAbsolutePositions();
  return true;
}
