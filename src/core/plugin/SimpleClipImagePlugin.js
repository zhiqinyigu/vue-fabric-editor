import { fabric } from 'fabric';
import { getPolygonVertices } from '../../../src/utils/math';
import { get, set } from 'lodash-es';

const getBounds = (activeObject) => ({
  width: activeObject.getScaledWidth(),
  height: activeObject.getScaledHeight(),
});

const bindInfo = (shell, activeObject) => {
  bindFlagToObject(shell);
  bindFlagToObject(shell, 'targetId', get(activeObject, 'id'));
  bindFlagToObject(shell, 'targetType', get(activeObject, 'type'));
};
const bindFlagToObject = (activeObject, key = 'clip', value = true) => {
  set(activeObject, key, value);
};

// 裁切交互期统一同步（拖动/旋转/缩放与面板数值编辑共用）：
// clipPath 在选中态为 absolutePositioned（画布绝对坐标），几何中心/角度/轴缩放
// 全部跟随 shell；末尾 setCoords 刷新命中检测、dirty 触发宿主图重绘（仅裁切为临时交互层）
export const syncClipToShell = (shell, clipPath, target, canvas) => {
  if (!shell || !clipPath || !target) return;
  clipPath.set({ angle: shell.angle, scaleX: shell.scaleX, scaleY: shell.scaleY });
  clipPath.setPositionByOrigin(shell.getCenterPoint(), 'center', 'center');
  shell.setCoords();
  target.set('dirty', true);
  if (canvas) canvas.requestRenderAll();
};

// shell 控件收窄（实例级 controls 拷贝，不触碰全局 prototype 定制）：
// - 删掉四角隐藏旋转柄（mtr2/3/4），拖角只做等比缩放，杜绝"拖角误触旋转"
// - 边缘柄换回纯 scalingX/scalingY，斜切分支被裁掉（clipPath 不支持 skew，斜切无法同步）
// - 四角等比缩放（scalingEqually）与主旋钮 mtr 保留（旋转围绕中心，唯一同步量 angle）
// - strokeWidth 归零：默认描边 strokeWidth=1 会计入 getScaledWidth（fabric 5.4 尺寸含描边），
//   裁切 shell 无描边渲染价值，归零使面板 W/H ↔ scale 换算自洽（否则每回合 +1px 漂移）
// - excludeFromExport：shell 是临时交互层，历史快照/保存不可序列化
export function configureClipShellControls(shell) {
  shell.controls = { ...shell.controls };
  ['mtr2', 'mtr3', 'mtr4'].forEach((key) => {
    delete shell.controls[key];
  });
  ['ml', 'mr', 'mt', 'mb'].forEach((key) => {
    if (!shell.controls[key]) return;
    shell.controls[key] = new fabric.Control({
      ...shell.controls[key],
      cursorStyleHandler: fabric.controlsUtils.scaleCursorStyleHandler,
      actionHandler:
        key === 'ml' || key === 'mr'
          ? fabric.controlsUtils.scalingX
          : fabric.controlsUtils.scalingY,
    });
  });
  shell.strokeWidth = 0;
  shell.excludeFromExport = true;
}

// 绘制区左上顶点（原点)：fabric 尺寸含描边（getPointByOrigin 给的是含描边外角），
// 描边内缩 sw/2 并随对象角度旋转——零点/回写统一用绘制区顶点，避免 ±半像素读数偏差
const paintedTopLeft = (obj) => {
  const corner = obj.getPointByOrigin('left', 'top');
  const v = fabric.util.rotatePoint(
    new fabric.Point((obj.strokeWidth || 0) / 2, (obj.strokeWidth || 0) / 2),
    new fabric.Point(0, 0),
    fabric.util.degreesToRadians(obj.angle || 0)
  );
  return new fabric.Point(corner.x + v.x, corner.y + v.y);
};

// shell 当前几何 → 面板相对值（读）：
// X/Y = 裁切块左上角相对图片绘制区左上角（零点=图片左上，裁到图左上角即 0,0，数值非负直读）；
// 沿图片轴线展开（对角点差向量做 R(−img.angle) 自由向量化，pivot 无关），
// 仅与两角点差值有关：img 的 originX/Y（left/center 皆可）、scale、flip 均不影响语义；W/H = shell 屏幕尺寸
export function clipBoxFromShell(shell, img) {
  const delta = new fabric.Point(
    paintedTopLeft(shell).x - paintedTopLeft(img).x,
    paintedTopLeft(shell).y - paintedTopLeft(img).y
  );
  const rel = fabric.util.rotatePoint(
    delta,
    new fabric.Point(0, 0),
    fabric.util.degreesToRadians(-(img.angle || 0))
  );
  return {
    x: rel.x,
    y: rel.y,
    width: shell.getScaledWidth(),
    height: shell.getScaledHeight(),
    angle: shell.angle,
  };
}

// 面板相对值 → shell/clipPath 应用（写）：
// 1) 裁切块左上角 = 图片包围盒左上角 + R(img.angle)·(x,y)（与读态同一直角三角）；
// 2) 半边长（屏幕 px）按 R(shellAngle) 在画布系内旋转叠加得裁切块中心；
// 3) shell 角/轴缩放应用后 setPositionByOrigin 定中心，clipPath 统一 sync
export function applyClipBoxToShell(shell, img, box, canvas) {
  const width = Math.max(get(box, 'width', shell.getScaledWidth()) || 1, 1);
  const height = Math.max(get(box, 'height', shell.getScaledHeight()) || 1, 1);
  const angle = get(box, 'angle', shell.angle) || 0;
  // 局部几何尺寸（与 getScaledWidth 同口径）→ 换算 scaleX/scaleY
  const dims = shell._getNonTransformedDimensions();
  if (!dims || !dims.x || !dims.y) return;
  const topLeftAbs0 = paintedTopLeft(img);
  const rel = fabric.util.rotatePoint(
    new fabric.Point(get(box, 'x', 0), get(box, 'y', 0)),
    new fabric.Point(0, 0),
    fabric.util.degreesToRadians(img.angle || 0)
  );
  const topLeftAbs = new fabric.Point(topLeftAbs0.x + rel.x, topLeftAbs0.y + rel.y);
  const rad = fabric.util.degreesToRadians(angle);
  const halfVec = new fabric.Point(width / 2, height / 2);
  const centerAbs = new fabric.Point(
    topLeftAbs.x + halfVec.x * Math.cos(rad) - halfVec.y * Math.sin(rad),
    topLeftAbs.y + halfVec.x * Math.sin(rad) + halfVec.y * Math.cos(rad)
  );
  shell.set({ angle, scaleX: width / dims.x, scaleY: height / dims.y });
  shell.setPositionByOrigin(centerAbs, 'center', 'center');
  shell.setCoords();
  syncClipToShell(shell, get(img, 'clipPath'), img, canvas);
}

const createRectClip = (activeObject, inverted) => {
  const { width = 0, height = 0 } = getBounds(activeObject);
  const point = activeObject.getCenterPoint();
  const clipW = Math.round(width / 2);
  const clipH = Math.round(height / 2);
  const shell = new fabric.Rect({
    width: clipW,
    height: clipH,
    fill: 'rgba(0,0,0,0)',
    originX: 'center',
    originY: 'center',
    left: point.x,
    top: point.y,
  });
  bindInfo(shell, activeObject);
  const clipPath = new fabric.Rect({
    absolutePositioned: true,
    width: shell.width,
    height: shell.height,
    originX: 'center',
    originY: 'center',
    left: shell.left,
    top: shell.top,
    inverted: inverted,
  });
  return { clipPath, shell };
};
const createTriClip = (activeObject, inverted) => {
  const point = activeObject.getCenterPoint();
  const { width = 0, height = 0 } = getBounds(activeObject);
  const clipW = Math.round(width / 2);
  const clipH = Math.round(height / 2);
  const shell = new fabric.Triangle({
    fill: 'rgba(0,0,0,0)',
    originX: 'center',
    originY: 'center',
    left: point.x,
    top: point.y,
    width: clipW,
    height: clipH,
  });
  bindInfo(shell, activeObject);
  const clipPath = new fabric.Triangle({
    absolutePositioned: true,
    originX: 'center',
    originY: 'center',
    left: shell.left,
    top: shell.top,
    width: shell.width,
    height: shell.height,
    inverted: inverted,
  });
  return { shell, clipPath };
};
const createPolygonClip = (activeObject, inverted) => {
  const point = activeObject.getCenterPoint();
  const points = getPolygonVertices(5, 200);
  const shell = new fabric.Polygon(points, {
    fill: 'rgba(0,0,0,0)',
    originY: 'center',
    originX: 'center',
    left: point.x,
    top: point.y,
  });
  bindInfo(shell, activeObject);
  const clipPath = new fabric.Polygon([...points], {
    absolutePositioned: true,
    originX: 'center',
    originY: 'center',
    left: shell.left,
    top: shell.top,
    inverted: inverted,
  });
  return { shell, clipPath };
};
// 圆形裁切形状纯函数（可独立调用；plugin 与单测共用）：
// 默认圆直径 = 显示宽高短边（内切圆，覆盖到方图/横竖图的短边为止）——
// 与纯 json 裁切语义同源（转换器 legacy avatar 的 clipPath 亦同此口径）
export function createCircleClipShapes(displayWidth, displayHeight, center, inverted = false) {
  const r = Math.min(displayWidth, displayHeight) / 2;
  // 圆心坐标两种形状（其余形状入参同为 getCenterPoint() → fabric.Point {x,y};
  // shell 形态 {left,top} 兼容纯函数直接复用）
  const cx = center.x ?? center.left;
  const cy = center.y ?? center.top;
  const shell = new fabric.Ellipse({
    fill: 'rgba(0,0,0,0)',
    originX: 'center',
    originY: 'center',
    left: cx,
    top: cy,
    rx: r,
    ry: r,
  });
  const clipPath = new fabric.Ellipse({
    absolutePositioned: true,
    originX: 'center',
    originY: 'center',
    left: cx,
    top: cy,
    inverted,
    rx: shell.rx,
    ry: shell.ry,
  });
  return { shell, clipPath };
}
class SimpleClipImagePlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
  }
  addClipPathToImage(value) {
    const activeObject = this.canvas.getActiveObjects()[0];
    if (activeObject && activeObject.type === 'image') {
      let clip = null;
      const [name, inverted] = value.split('-');
      const isInverted = !!inverted;
      switch (name) {
        case 'polygon':
          clip = createPolygonClip(activeObject, isInverted);
          break;
        case 'rect':
          clip = createRectClip(activeObject, isInverted);
          break;
        case 'circle':
          clip = createCircleClipShapes(
            getBounds(activeObject).width,
            getBounds(activeObject).height,
            activeObject.getCenterPoint(),
            isInverted
          );
          break;
        case 'triangle':
          clip = createTriClip(activeObject, isInverted);
          break;
      }
      if (clip == null) return;
      const { shell, clipPath } = clip;
      bindInfo(shell, activeObject);
      // 宿主直引用：裁切面板解析目标不依赖图片 id（临时交互层，excludeFromExport 不被序列化）
      shell.targetImage = activeObject;
      // 临时交互层：控件收窄（纯四角缩放/旋转）+ 剔出序列化
      configureClipShellControls(shell);
      shell.on('moving', () => {
        syncClipToShell(shell, clipPath, activeObject);
      });
      shell.on('rotating', () => {
        syncClipToShell(shell, clipPath, activeObject);
      });
      shell.on('scaling', () => {
        syncClipToShell(shell, clipPath, activeObject);
      });
      shell.on('deselected', () => this._finalizeClip(activeObject, shell, clipPath));
      activeObject.set({ clipPath: clipPath });
      this.canvas.add(shell);
      this.canvas.setActiveObject(shell);
    }
  }
  // 落盘相对化（绝对选择态 → 相对持久态）：
  // - 位置/缩放：left/top = R(−img.angle)·Δ中心·(1/imgScale)，scale = 1/imgScale（原口径）
  // - 角度补偿（关键）：相对 clip 的视觉角 = img.angle + clip.angle，须与选中态 shell.angle
  //   一致 → clip.angle = shell.angle − img.angle（否则旋转图片退出后裁切随图"双重旋转"）
  correctPosition(activeObject, shell, clipPath) {
    const position = activeObject.toLocalPoint(shell.getCenterPoint(), 'center', 'center');
    const { scaleX = 1, scaleY = 1 } = activeObject;
    clipPath.set({
      absolutePositioned: false,
      left: position.x / scaleX,
      top: position.y / scaleY,
      scaleX: 1 / scaleX,
      scaleY: 1 / scaleY,
      angle: this.normalizeAngle(shell.angle - (activeObject.angle || 0)),
    });
    clipPath.setCoords();
  }
  // 角度归一化 [0, 360)
  normalizeAngle(angle) {
    return Math.round((((angle || 0) % 360) + 360) % 360);
  }
  removeClip() {
    const activeObject = this.canvas.getActiveObjects()[0];
    if (activeObject && activeObject.type === 'image') {
      activeObject.set({ clipPath: undefined });
      activeObject.set('dirty', true);
      this.canvas.requestRenderAll();
    }
  }
  // 重新进入裁切编辑（退出裁切后从既有 clipPath 重建 shell 载回交互）：
  // - 中心：img 变换矩阵 × clip 自身矩阵（clip 中心点即其自身 local(0,0)）链式映射画布绝对点
  // - 屏幕尺寸：fabric 相对 clip 的屏幕尺寸 = 几何(未缩放值) × |clip.scale| × |img.scale|
  //   （correctPosition 存的是"屏幕值 × 1/imgScale"的补偿口径，两式自洽）
  // - 角度：clip.angle 为"相对图片"角度，shell 绝对角 = clip.angle + img.angle
  //   （与 correctPosition 的 shell.angle − img.angle 补偿互逆，退出/再进视觉一致）
  // - clip 切回选中态 absolutePositioned 由 shell 事件统一同步；deselect 落盘口径不变
  enterClipEdit() {
    const activeObject = this.canvas.getActiveObjects()[0];
    if (!activeObject || activeObject.type !== 'image') return;
    const img = activeObject;
    const clipPath = get(img, 'clipPath');
    if (!clipPath) return;
    const absCenter = fabric.util.transformPoint(
      new fabric.Point(0, 0),
      fabric.util.multiplyTransformMatrices(
        img.calcTransformMatrix(),
        clipPath.calcTransformMatrix()
      )
    );
    const kx = Math.abs((clipPath.scaleX || 1) * (img.scaleX || 1));
    const ky = Math.abs((clipPath.scaleY || 1) * (img.scaleY || 1));
    let shell;
    switch (clipPath.type) {
      case 'ellipse':
        shell = new fabric.Ellipse({
          fill: 'rgba(0,0,0,0)',
          originX: 'center',
          originY: 'center',
          rx: clipPath.rx * kx,
          ry: clipPath.ry * ky,
        });
        break;
      case 'triangle':
        shell = new fabric.Triangle({
          fill: 'rgba(0,0,0,0)',
          originX: 'center',
          originY: 'center',
          width: clipPath.width * kx,
          height: clipPath.height * ky,
        });
        break;
      case 'polygon':
        shell = new fabric.Polygon(
          clipPath.points.map((p) => ({ x: p.x, y: p.y })),
          { fill: 'rgba(0,0,0,0)', originY: 'center', originX: 'center' }
        );
        shell.scaleX = kx;
        shell.scaleY = ky;
        break;
      default:
        shell = new fabric.Rect({
          fill: 'rgba(0,0,0,0)',
          originX: 'center',
          originY: 'center',
          width: clipPath.width * kx,
          height: clipPath.height * ky,
        });
    }
    // 相对 clip → 选中态绝对坐标；clip scale 归 1（shell 尺寸直接取屏幕值）
    clipPath.set({ absolutePositioned: true, scaleX: 1, scaleY: 1 });
    bindInfo(shell, img);
    shell.targetImage = img;
    // 相对角 → 绝对角（correctPosition 补偿的逆变换）
    shell.angle = this.normalizeAngle((clipPath.angle || 0) + (img.angle || 0));
    configureClipShellControls(shell);
    shell.on('moving', () => syncClipToShell(shell, clipPath, img));
    shell.on('rotating', () => syncClipToShell(shell, clipPath, img));
    shell.on('scaling', () => syncClipToShell(shell, clipPath, img));
    shell.on('deselected', () => this._finalizeClip(img, shell, clipPath));
    this.canvas.add(shell);
    shell.setPositionByOrigin(absCenter, 'center', 'center');
    shell.setCoords();
    syncClipToShell(shell, clipPath, img, this.canvas);
    this.canvas.setActiveObject(shell);
  }
  // 退出落盘收敛（新建/重建共用）：
  // - 形状内缩换算（沿旧口径）：correctPosition 先置 clip.scale = 1/imgScale，
  //   此时组合缩放恒 1，屏幕 dims = clip 未缩放几何值本身 → ellipse 用 getRx()/rect
  //   用 shell 屏幕值回写；polygon 因 clip.scale 与 shell.scale 语义不同另行乘积
  // - 角度补偿与相对化由 correctPosition 统一写入
  _finalizeClip(img, shell, clipPath) {
    this.correctPosition(img, shell, clipPath);
    if (clipPath instanceof fabric.Ellipse && shell instanceof fabric.Ellipse) {
      clipPath.set({ rx: shell.getRx(), ry: shell.getRy() });
    } else if (shell instanceof fabric.Polygon) {
      const { scaleX: cSx = 1, scaleY: cSy = 1 } = clipPath;
      const { scaleX: sSx = 1, scaleY: sSy = 1 } = shell;
      clipPath.set('scaleX', cSx * sSx);
      clipPath.set('scaleY', cSy * sSy);
    } else {
      clipPath.set('width', shell.getScaledWidth());
      clipPath.set('height', shell.getScaledHeight());
    }
    img.set('dirty', true);
    this.canvas.remove(shell);
    this.canvas.requestRenderAll();
  }
}
SimpleClipImagePlugin.pluginName = 'SimpleClipImagePlugin';
//  static events = ['sizeChange'];
SimpleClipImagePlugin.apis = ['addClipPathToImage', 'removeClip', 'enterClipEdit'];
export default SimpleClipImagePlugin;
