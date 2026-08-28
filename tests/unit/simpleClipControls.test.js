/**
 * 裁切交互层（SimpleClipImagePlugin）辅助纯函数：
 * - configureClipShellControls：shell 控件收窄（删角旋钮/边缘纯缩放）+ excludeFromExport
 * - syncClipToShell：clipPath 几何中心/角度/轴缩放跟随 shell（交互与面板共用语义）
 * - 面板相对坐标换算：clipRelativeTopLeftLocal / clipBoxFromShell / applyClipBoxToShell
 *   （X/Y 相对图片左上角，图片渲染像素；读→应用 round-trip 幂等）
 * - Editor 集成：.use(SimpleClipImagePlugin) 全链路（selection 事件 / shell 标记 / 吸附跳过）
 */
import { fabric } from 'fabric';
import Editor from './../../src/core/index';
import './../../src/core/renderPatches';
import { setupGuideLine } from './../../src/core/ruler/guideline';
import ControlsRotatePlugin from './../../src/core/plugin/ControlsRotatePlugin';
import SimpleClipImagePlugin from './../../src/core/plugin/SimpleClipImagePlugin';
import AlignGuidLinePlugin from './../../src/core/plugin/AlignGuidLinePlugin';
import {
  configureClipShellControls,
  syncClipToShell,
  clipBoxFromShell,
  applyClipBoxToShell,
} from './../../src/core/plugin/SimpleClipImagePlugin';

function makeImage(nw, nh, props = {}) {
  const el = document.createElement('img');
  Object.defineProperty(el, 'src', {
    value: 'https://x/' + props.id,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(el, 'width', { value: nw, writable: true, configurable: true });
  Object.defineProperty(el, 'height', { value: nh, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalWidth', { value: nw, writable: true, configurable: true });
  Object.defineProperty(el, 'naturalHeight', { value: nh, writable: true, configurable: true });
  Object.defineProperty(el, 'complete', { value: true, writable: true, configurable: true });
  const img = new fabric.Image(el);
  img.set(props);
  return img;
}

describe('configureClipShellControls：shell 控件收窄', () => {
  it('删除四角隐藏旋转柄；边缘柄换纯缩放；四角等比缩放/主旋钮保留', () => {
    const shell = new fabric.Ellipse({ rx: 20, ry: 20, originX: 'center', originY: 'center' });
    const snapshot = {
      mtr: shell.controls.mtr,
      tl: shell.controls.tl,
      br: shell.controls.br,
      ml: shell.controls.ml,
    };
    configureClipShellControls(shell);
    expect(shell.controls.mtr2).toBeUndefined();
    expect(shell.controls.mtr3).toBeUndefined();
    expect(shell.controls.mtr4).toBeUndefined();
    // 主旋钮与四角等比缩放未被替换
    expect(shell.controls.mtr).toBe(snapshot.mtr);
    expect(shell.controls.tl).toBe(snapshot.tl);
    expect(shell.controls.br).toBe(snapshot.br);
    // 边缘柄：ml/mr = 纯横缩放，mt/mb = 纯纵缩放
    expect(shell.controls.ml).not.toBe(snapshot.ml);
    expect(shell.controls.ml.actionHandler).toBe(fabric.controlsUtils.scalingX);
    expect(shell.controls.mr.actionHandler).toBe(fabric.controlsUtils.scalingX);
    expect(shell.controls.mt.actionHandler).toBe(fabric.controlsUtils.scalingY);
    expect(shell.controls.mb.actionHandler).toBe(fabric.controlsUtils.scalingY);
    expect(shell.controls.ml.cursorStyleHandler).toBe(fabric.controlsUtils.scaleCursorStyleHandler);
    // strokeWidth 归零：尺寸读取（含描边口径）与 scale 换算自洽
    expect(shell.strokeWidth).toBe(0);
  });

  it('不污染全局 prototype 控件（mtr2/3/4 仍在，其他对象不受影响）', () => {
    // 实例化旋转插件挂载全局控件（编辑器启动时序）
    new ControlsRotatePlugin(new fabric.StaticCanvas(), {});
    const shell = new fabric.Ellipse({ rx: 20, ry: 20 });
    configureClipShellControls(shell);
    // 实例级收窄：shell 无四角旋钮；全局 prototype 保持完整（其他对象不受影响）
    expect(shell.controls.mtr2).toBeUndefined();
    expect(fabric.Object.prototype.controls.mtr2).toBeInstanceOf(fabric.Control);
    expect(fabric.Object.prototype.controls.mtr3).toBeInstanceOf(fabric.Control);
    expect(fabric.Object.prototype.controls.mtr4).toBeInstanceOf(fabric.Control);
    expect(fabric.Object.prototype.controls.mtr).toBeInstanceOf(fabric.Control);
  });

  it('excludeFromExport：临时 shell 不进入 toJSON（历史快照/保存不可见）', () => {
    const canvas = new fabric.StaticCanvas();
    const shell = new fabric.Ellipse({ rx: 20, ry: 20, left: 10, top: 10 });
    configureClipShellControls(shell);
    canvas.add(shell);
    expect(shell.excludeFromExport).toBe(true);
    expect(canvas.toJSON().objects).toHaveLength(0);
    canvas.remove(shell);
  });
});

describe('syncClipToShell：clip 跟随 shell 统一同步', () => {
  it('中心/角度/轴缩放全部跟随，dirty 触发宿主重绘标记', () => {
    const shell = new fabric.Ellipse({
      rx: 30,
      ry: 30,
      originX: 'center',
      originY: 'center',
      left: 140,
      top: 120,
      angle: 15,
      scaleX: 1.4,
      scaleY: 1.2,
    });
    const clip = new fabric.Rect({
      absolutePositioned: true,
      originX: 'center',
      originY: 'center',
    });
    const target = { set: jest.fn() };
    syncClipToShell(shell, clip, target);
    expect(clip.angle).toBe(15);
    expect(clip.scaleX).toBe(1.4);
    expect(clip.scaleY).toBe(1.2);
    expect(clip.left).toBe(140);
    expect(clip.top).toBe(120);
    expect(target.set).toHaveBeenCalledWith('dirty', true);
  });

  it('缺失任一入参直接短路', () => {
    expect(syncClipToShell(null, null, { set: jest.fn() })).toBeUndefined();
  });
});

describe('裁切面板相对坐标换算', () => {
  it('零点 = 图片包围盒左上角：左上 1/4 裁切 → X=Y=0；右下 1/4 → X=100/Y=50', () => {
    const img = makeImage(200, 100, { id: 'i', scaleX: 1, scaleY: 1 });
    img.set({ left: 100, top: 40 });
    const shell = new fabric.Rect({
      width: 100,
      height: 50,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
    });
    configureClipShellControls(shell);
    // 左上 1/4 象限：(0,0) 应钉在图片包围盒左上角，回读归零
    applyClipBoxToShell(shell, img, { x: 0, y: 0, width: 100, height: 50, angle: 0 });
    const boxTL = clipBoxFromShell(shell, img);
    expect(boxTL.x).toBeCloseTo(0, 4);
    expect(boxTL.y).toBeCloseTo(0, 4);
    // 右下 1/4 象限：角点差 (100, 50)，回读同值
    applyClipBoxToShell(shell, img, { x: 100, y: 50, width: 100, height: 50, angle: 0 });
    const boxBR = clipBoxFromShell(shell, img);
    expect(boxBR.x).toBeCloseTo(100, 4);
    expect(boxBR.y).toBeCloseTo(50, 4);
  });

  it('零点与 img 的 scale/origin/angle 解耦：缩放/旋转图片后，(0,0) 仍=图片包围盒左上角', () => {
    const img = makeImage(200, 100, { id: 'i0', scaleX: 1.5, scaleY: 2, angle: 20 });
    img.set({ left: 500, top: 300 });
    const shell = new fabric.Rect({
      width: 100,
      height: 50,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
    });
    configureClipShellControls(shell);
    // (0,0,100,50)：shell 左上角应钉在图片绘制区左上角
    applyClipBoxToShell(shell, img, { x: 0, y: 0, width: 100, height: 50, angle: 0 });
    const shellTL = shell.getPointByOrigin('left', 'top');
    expect(shellTL.x).toBeCloseTo(img.getPointByOrigin('left', 'top').x, 2);
    expect(shellTL.y).toBeCloseTo(img.getPointByOrigin('left', 'top').y, 2);
    // 读态回读：裁切在图片左上角 → X=Y=0（与 scale/angle 无关）
    const box = clipBoxFromShell(shell, img);
    expect(box.x).toBeCloseTo(0, 2);
    expect(box.y).toBeCloseTo(0, 2);
  });

  it('clipBoxFromShell / applyClipBoxToShell：读 → 应用 round-trip 幂等（含旋转/缩放图片）', () => {
    const img = makeImage(200, 120, { id: 'i2', scaleX: 1.5, scaleY: 2, angle: 20 });
    img.set({ left: 100, top: 60 });
    const shell = new fabric.Rect({
      width: 60,
      height: 40,
      originX: 'center',
      originY: 'center',
      left: 150,
      top: 100,
      angle: 30,
    });
    configureClipShellControls(shell);
    const box = clipBoxFromShell(shell, img);
    const shell2 = new fabric.Rect({
      width: 60,
      height: 40,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
    });
    configureClipShellControls(shell2);
    // 每次应用后 shell2 的 center/scale 回到与 box 相同的几何
    applyClipBoxToShell(shell2, img, box);
    expect(shell2.getScaledWidth()).toBeCloseTo(box.width, 4);
    expect(shell2.getScaledHeight()).toBeCloseTo(box.height, 4);
    expect(shell2.angle).toBe(Math.round((((box.angle || 0) % 360) + 360) % 360));
    expect(shell2.getCenterPoint().x).toBeCloseTo(shell.getCenterPoint().x, 2);
    expect(shell2.getCenterPoint().y).toBeCloseTo(shell.getCenterPoint().y, 2);
    const box2 = clipBoxFromShell(shell2, img);
    expect(box2.x).toBeCloseTo(box.x, 2);
    expect(box2.y).toBeCloseTo(box.y, 2);
    expect(box2.width).toBeCloseTo(box.width, 2);
    expect(box2.height).toBeCloseTo(box.height, 2);
  });

  it('applyClipBoxToShell 同步 clipPath 到画布绝对中心与角度（doubleTransform 一致）', () => {
    const img = makeImage(200, 120, { id: 'i3', scaleX: 2, scaleY: 2 });
    img.set({ left: 100, top: 50 });
    img.set({
      clipPath: new fabric.Ellipse({
        absolutePositioned: true,
        originX: 'center',
        originY: 'center',
        rx: 30,
        ry: 30,
      }),
    });
    const shell = new fabric.Ellipse({
      rx: 30,
      ry: 30,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
    });
    applyClipBoxToShell(shell, img, { x: 80, y: 40, width: 100, height: 100, angle: 10 });
    const clip = img.get('clipPath');
    expect(clip.left).toBeCloseTo(shell.getCenterPoint().x, 4);
    expect(clip.top).toBeCloseTo(shell.getCenterPoint().y, 4);
    expect(clip.angle).toBe(10);
    expect(clip.scaleX).toBe(shell.scaleX);
    expect(clip.scaleY).toBe(shell.scaleY);
  });
});

describe('addClipPathToImage：shell 绑定与面板可解析', () => {
  it('circle：shell 带裁切标记 + 宿主直引用，图片挂 ellipse clipPath（图片无 id 也可）', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'));
    const plugin = new SimpleClipImagePlugin(canvas, {});
    // 不传 id：targetId 兜底解析必然失败，面板须走 targetImage 直引用
    const img = makeImage(240, 160);
    canvas.add(img);
    canvas.setActiveObject(img);
    plugin.addClipPathToImage('circle');
    const shell = canvas.getActiveObject();
    expect(shell).toBeInstanceOf(fabric.Ellipse);
    expect(shell.get('clip')).toBe(true);
    expect(shell.targetType).toBe('image');
    expect(shell.targetImage).toBe(img);
    // 图片未设 id（renderPatches 可能注入兜底 id）：无有效字符串 id 即走直引用
    expect(typeof shell.targetId).not.toBe('string');
    // 控件收窄 + 临时层标记
    expect(shell.controls.mtr2).toBeUndefined();
    expect(shell.excludeFromExport).toBe(true);
    // 宿主图片挂上圆 clipPath（短边内切圆）
    const clip = img.get('clipPath');
    expect(clip).toBeInstanceOf(fabric.Ellipse);
    expect(clip.inverted).toBe(false);
    expect(clip.rx * clip.scaleX * img.scaleX).toBeCloseTo(160 / 2, 5);
    // shell 不进 toJSON（仅宿主图 1 个对象）
    expect(canvas.toJSON().objects).toHaveLength(1);
  });

  it('rect：shell/clipPath 尺寸为图片显示尺寸一半（与旧版裁切口径一致）', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'));
    const plugin = new SimpleClipImagePlugin(canvas, {});
    const img = makeImage(240, 160, { id: 'i5' });
    img.set({ left: 50, top: 40 });
    canvas.add(img);
    canvas.setActiveObject(img);
    plugin.addClipPathToImage('rect');
    const shell = canvas.getActiveObject();
    expect(shell).toBeInstanceOf(fabric.Rect);
    expect(shell.getScaledWidth()).toBeCloseTo(240 / 2, 2);
    expect(shell.getScaledHeight()).toBeCloseTo(160 / 2, 2);
    expect(shell.targetImage).toBe(img);
  });

  it('enterClipEdit：退出裁切后从 clipPath 重建 shell（缩放/旋转图片不做形），形状/位置尺寸复原', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'));
    const plugin = new SimpleClipImagePlugin(canvas, {});
    const img = makeImage(240, 160, { id: 'i6', scaleX: 1.5, scaleY: 2, angle: 20 });
    img.set({ left: 120, top: 80 });
    canvas.add(img);
    canvas.setActiveObject(img);
    plugin.addClipPathToImage('circle');
    const originalShell = canvas.getActiveObject();
    const originalCenter = originalShell.getCenterPoint();
    const originalRxScreen = originalShell.getRx();
    // 退出裁切：deselect 触发 correctPosition 相对化落盘
    canvas.discardActiveObject();
    const clip = img.get('clipPath');
    expect(clip.absolutePositioned).toBe(false);
    // 重新进入裁切编辑
    canvas.setActiveObject(img);
    plugin.enterClipEdit();
    const shell = canvas.getActiveObject();
    expect(shell.targetImage).toBe(img);
    expect(shell).toBeInstanceOf(fabric.Ellipse);
    // 中心与屏幕半径复原（图片缩放/旋转下位置/尺寸均不漂移）
    expect(shell.getCenterPoint().x).toBeCloseTo(originalCenter.x, 2);
    expect(shell.getCenterPoint().y).toBeCloseTo(originalCenter.y, 2);
    expect(shell.getRx()).toBeCloseTo(originalRxScreen, 2);
    // 选中态：clip 切回绝对坐标（交互口径），dirty 触发宿主图重绘
    expect(clip.absolutePositioned).toBe(true);
    expect(clip.left).toBeCloseTo(shell.getCenterPoint().x, 2);
    // 再次退出落盘：相对化 + shell 移除
    canvas.discardActiveObject();
    expect(img.get('clipPath').absolutePositioned).toBe(false);
    expect(canvas.getObjects().filter((o) => o.get && o.get('clip'))).toHaveLength(0);
  });

  it('退出裁切保持图片旋转状态：相对角补偿（shell angle − img angle），再进复原', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'));
    const plugin = new SimpleClipImagePlugin(canvas, {});
    const img = makeImage(240, 160, { id: 'i7', angle: 30 });
    img.set({ left: 120, top: 80 });
    canvas.add(img);
    canvas.setActiveObject(img);
    plugin.addClipPathToImage('circle');
    canvas.discardActiveObject();
    const clip = img.get('clipPath');
    // 落盘补偿：clip.angle = shell.angle − img.angle = 0 − 30 = 330（合成视觉角回到 0）
    expect(clip.angle).toBe(330);
    // 再进：shell 绝对角 = clip.angle + img.angle = 330 + 30 = 0
    canvas.setActiveObject(img);
    plugin.enterClipEdit();
    expect(canvas.getActiveObject().angle).toBe(0);
    expect(canvas.getActiveObject().angle).not.toBe(undefined);
    // 再退出，二次落盘一致（无累积漂移）
    canvas.discardActiveObject();
    expect(img.get('clipPath').angle).toBe(330);
  });
});

describe('Editor 全链路集成（use(SimpleClipImagePlugin)）', () => {
  const buildEditor = () => {
    // ServersPlugin 的辅助线过滤依赖全局 GuideLine（编辑器经 ruler 初始化）
    setupGuideLine();
    const editor = new Editor();
    editor.init(new fabric.Canvas(document.createElement('canvas'), { width: 600, height: 400 }));
    editor.use(SimpleClipImagePlugin);
    return editor;
  };

  it('addClipPathToImage → selection 事件带 shell；shell 标记/直引用/收窄齐备', () => {
    const editor = buildEditor();
    const seen = [];
    editor.on('selectOne', (arr) => seen.push(arr));
    const img = makeImage(240, 160, { id: 'e1' });
    editor.canvas.add(img);
    editor.canvas.setActiveObject(img);
    editor.addClipPathToImage('circle');
    // selection 事件序列：先图后 shell，末次即 shell（裁切会话派发）
    const shellArr = seen[seen.length - 1];
    expect(shellArr).toHaveLength(1);
    const shell = shellArr[0];
    expect(shell.get('clip')).toBe(true);
    expect(shell.targetImage).toBe(img);
    expect(shell.controls.mtr2).toBeUndefined();
    expect(shell.excludeFromExport).toBe(true);
    expect(img.get('clipPath')).toBeInstanceOf(fabric.Ellipse);
  });

  it('裁切 shell 不被吸附对齐改写（object:scaling/moving 吸附跳过）', () => {
    const editor = buildEditor();
    editor.use(AlignGuidLinePlugin);
    const img = makeImage(240, 160, { id: 'e2' });
    editor.canvas.add(img);
    editor.canvas.setActiveObject(img);
    editor.addClipPathToImage('circle');
    const shell = editor.canvas.getActiveObject();
    const before = shell.getCenterPoint();
    // 画布事件直灌（吸附命中路径：与宿主图片边缘天然接近，稍加位移即可命中 4px 容差）
    editor.canvas.fire('object:scaling', { target: shell, transform: { corner: 'tl' } });
    editor.canvas.fire('object:moving', { target: shell });
    // 吸附不可改写 shell 的 scale/位置/控件可见性（口径：过滤入口早返回）
    expect(shell.scaleX).toBe(1);
    expect(shell.scaleY).toBe(1);
    expect(shell.hasControls).not.toBe(false);
    expect(shell.getCenterPoint().x).toBeCloseTo(before.x, 4);
    expect(shell.getCenterPoint().y).toBeCloseTo(before.y, 4);
  });
});
