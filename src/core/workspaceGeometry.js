/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-28 10:25:25
 * workspace / 背景图几何计算（编辑器 WorkspacePlugin 与渲染器 RendererCore 共用，纯逻辑）
 * - computeBackgroundLayout：cover / contain / tile 背景布局
 * - cloneWorkspaceAsClip：克隆 workspace 作为画布裁切区域（跟随尺寸变化）
 * 注意：入参 workspace 为 fabric 对象或同构 JSON（width/height/left/top/scaleX/scaleY）。
 */
import { fabric } from 'fabric';

// 计算背景对象布局（cover/contain 用 Image 的缩放与对齐，tile 用 Rect 铺满）
// position：{x, y}，取值 0~1（0=起始，0.5=居中，1=末尾）；缺省居中。
export function computeBackgroundLayout({ workspace, imageSize, mode, position }) {
  if (!workspace) return null;
  const rectW = (workspace.width || 0) * (workspace.scaleX || 1);
  const rectH = (workspace.height || 0) * (workspace.scaleY || 1);
  if (mode === 'tile') {
    return {
      left: workspace.left,
      top: workspace.top,
      width: rectW,
      height: rectH,
    };
  }
  const size = imageSize;
  if (!size || !(size.w > 0) || !(size.h > 0)) return null;
  const imgW = size.w;
  const imgH = size.h;
  const rectRatio = rectW / rectH;
  const imgRatio = imgW / imgH;
  let scale;
  if (mode === 'contain') {
    // contain 整体可见，取较小缩放
    scale = rectRatio > imgRatio ? rectH / imgH : rectW / imgW;
  } else {
    // cover 铺满裁剪，取较大缩放
    scale = rectRatio > imgRatio ? rectW / imgW : rectH / imgH;
  }
  const width = imgW * scale;
  const height = imgH * scale;
  const lx = position && position.x != null ? position.x : 0.5;
  const ly = position && position.y != null ? position.y : 0.5;
  return {
    left: workspace.left + (rectW - width) * lx,
    top: workspace.top + (rectH - height) * ly,
    scaleX: scale,
    scaleY: scale,
  };
}

// 更新画布裁切区域：克隆当前 workspace 作为 clipPath（高度变化时跟随）。
// 兜底：以最新 workspace 几何覆盖，避免异步乱序导致 clip 尺寸回退。
export function cloneWorkspaceAsClip(workspace, cb) {
  if (!workspace) {
    cb && cb(null);
    return;
  }
  workspace.clone((cloned) => {
    if (!cloned) {
      cb && cb(null);
      return;
    }
    cloned.set({
      width: workspace.get('width'),
      height: workspace.get('height'),
      left: workspace.get('left'),
      top: workspace.get('top'),
      scaleX: workspace.get('scaleX'),
      scaleY: workspace.get('scaleY'),
    });
    cb && cb(cloned);
  });
}

// 创建背景对象（cover/contain 用 Image，tile 用 Pattern 填充的 Rect）
// 编辑器 WorkspacePlugin 与渲染器 RendererWorkspacePlugin 共用同一实现。
export function createBackgroundObject({ img, layout, mode, position }) {
  const base = {
    id: 'backgroundImage',
    backgroundImageMode: mode,
    ...(position ? { backgroundPosition: position } : {}),
    selectable: false,
    evented: false,
    hasControls: false,
    hoverCursor: 'default',
    lockMovementX: true,
    lockMovementY: true,
  };
  if (mode === 'tile') {
    return new fabric.Rect({
      ...base,
      left: layout.left,
      top: layout.top,
      width: layout.width,
      height: layout.height,
      fill: new fabric.Pattern({ source: img, repeat: 'repeat' }),
    });
  }
  return new fabric.Image(img, {
    ...base,
    left: layout.left,
    top: layout.top,
    scaleX: layout.scaleX,
    scaleY: layout.scaleY,
  });
}

// 保留 Rect 引用重建 Pattern 填充（tile 变量背景换图/还原共用）：
// 直接 bg.set('fill', new Pattern) 并置 dirty，避免重建对象丢失引用。
export function replaceTilePatternSource(bg, imgEl, repeat = 'repeat') {
  if (!bg || !imgEl) return bg;
  bg.set('fill', new fabric.Pattern({ source: imgEl, repeat }));
  bg.dirty = true;
  return bg;
}
