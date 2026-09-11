/*
 * @Author: 秦少卫
 * @Date: 2023-06-27 12:26:41
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-12-24 13:13:06
 * @Description: 画布区域插件
 */
import { fabric } from 'fabric';
import { throttle } from 'lodash-es';
import { appendCacheBustParam } from '../assetUrl';
import { loadImageResilient, normalizeCrossOrigin } from '../imageLoader';
import { attachVariableOverlay } from '../objects/VariableImage';
import {
  computeBackgroundLayout,
  cloneWorkspaceAsClip,
  createBackgroundObject,
  replaceTilePatternSource,
} from '../workspaceGeometry';
class WorkspacePlugin {
  constructor(canvas, editor) {
    this.canvas = canvas;
    this.editor = editor;
    this.workspace = null;
    this.backgroundImageDataUrl = null;
    this.backgroundImageMode = 'cover';
    this.backgroundImagePosition = { x: 0.5, y: 0.5 };
    this.backgroundImageOpacity = 1;
    this.backgroundImageSize = null;
    // 变量背景标记：真实尺寸未知，设计期以占位图呈现，禁止触发"真实 URL 重载"
    this.backgroundImageVariable = false;
    this.init({
      width: 900,
      height: 1200,
    });
    this.zoomRatio = 0.85;
    // 历史恢复（undo/redo 走 loadFromJSON，不触发 hookImportAfter）后重捕获背景状态，
    // 否则内部状态失同步：撤销掉背景图后 resize 会经 _syncBackgroundImage 复活已撤销的背景
    this.canvas.on('history:undo', () => this._onHistoryRestore());
    this.canvas.on('history:redo', () => this._onHistoryRestore());
  }
  init(option) {
    const workspaceEl = document.querySelector('#workspace');
    if (!workspaceEl) {
      throw new Error('element #workspace is missing, plz check!');
    }
    this.workspaceEl = workspaceEl;
    this.workspace = null;
    this.option = option;
    this._initBackground();
    this._initWorkspace();
    this._initResizeObserve();
    this._bindWheel();
  }
  hookImportAfter() {
    return new Promise((resolve) => {
      const workspace = this.canvas.getObjects().find((item) => item.id === 'workspace');
      if (workspace) {
        workspace.set('selectable', false);
        workspace.set('hasControls', false);
        workspace.set('evented', false);
        if (workspace.width && workspace.height) {
          this.setSize(workspace.width, workspace.height);
          this.editor.emit('sizeChange', workspace.width, workspace.height);
        }
      }
      // 背景图同样禁止选中/编辑（兜底：旧模板 JSON 未持久化 evented/hasControls，
      // 且历史记录 undo/redo 等不走本钩子的加载路径需自行补齐，见 jsonOptimizer.enforceSystemObjectsReadonly）
      const bg = this._getBackgroundImageObj();
      if (bg) {
        bg.set('selectable', false);
        bg.set('evented', false);
        bg.set('hasControls', false);
        bg.set('hoverCursor', 'default');
      }
      // 记录从 JSON 加载的背景图数据，供后续 resize 同步
      this._captureBackgroundImage();
      // 变量背景（tile 形态）还原编辑态占位呈现
      this._restoreVariableBackgroundAfterImport();
      resolve('');
    });
  }
  hookSaveAfter() {
    return new Promise((resolve) => {
      this.auto();
      resolve(true);
    });
  }
  // 初始化背景
  _initBackground() {
    this.canvas.backgroundImage = '';
    this.canvas.setWidth(this.workspaceEl.offsetWidth);
    this.canvas.setHeight(this.workspaceEl.offsetHeight);
  }
  // 初始化画布
  _initWorkspace() {
    const { width, height } = this.option;
    const workspace = new fabric.Rect({
      fill: 'rgba(255,255,255,1)',
      width,
      height,
      id: 'workspace',
      strokeWidth: 0,
    });
    workspace.set('selectable', false);
    workspace.set('hasControls', false);
    workspace.hoverCursor = 'default';
    this.canvas.add(workspace);
    this.canvas.renderAll();
    this.workspace = workspace;
    if (this.canvas.clearHistory) {
      this.canvas.clearHistory();
    }
    this.auto();
  }
  // 返回workspace对象
  getWorkspase() {
    return this.canvas.getObjects().find((item) => item.id === 'workspace');
  }
  /**
   * 设置画布中心到指定对象中心点上
   * @param {Object} obj 指定的对象
   */
  setCenterFromObject(obj) {
    const { canvas } = this;
    const objCenter = obj.getCenterPoint();
    const viewportTransform = canvas.viewportTransform;
    if (canvas.width === undefined || canvas.height === undefined || !viewportTransform) return;
    viewportTransform[4] = canvas.width / 2 - objCenter.x * viewportTransform[0];
    viewportTransform[5] = canvas.height / 2 - objCenter.y * viewportTransform[3];
    canvas.setViewportTransform(viewportTransform);
    canvas.renderAll();
  }
  // 初始化监听器
  _initResizeObserve() {
    const resizeObserver = new ResizeObserver(
      throttle(() => {
        this.auto();
      }, 50)
    );
    this.resizeObserver = resizeObserver;
    this.resizeObserver.observe(this.workspaceEl);
  }
  setSize(width, height) {
    this._initBackground();
    this.option.width = width;
    this.option.height = height;
    // 重新设置workspace
    this.workspace = this.canvas.getObjects().find((item) => item.id === 'workspace');
    this.workspace.set('width', width);
    this.workspace.set('height', height);
    this.editor.emit('sizeChange', this.workspace.width, this.workspace.height);
    // 同步背景图尺寸
    this._syncBackgroundImage();
    this.auto();
  }
  /**
   * 静默调整画布尺寸：仅更新 workspace 尺寸与背景图，不改动视口缩放
   * （供"海报自适应增高"使用，避免预览态缩放跳变）
   * @param {number} width
   * @param {number} height
   */
  setSizeSilent(width, height) {
    this._initBackground();
    this.option.width = width;
    this.option.height = height;
    // 重新设置workspace
    this.workspace = this.canvas.getObjects().find((item) => item.id === 'workspace');
    this.workspace.set('width', width);
    this.workspace.set('height', height);
    this.editor.emit('sizeChange', this.workspace.width, this.workspace.height);
    // 同步背景图尺寸（就地更新，避免异步重建的竞态与闪烁）
    this._syncBackgroundImageSilent();
    // 同步裁切区域（clipPath 跟随新尺寸，增高部分不再被裁切）
    this._updateClipPath();
    this.canvas.requestRenderAll();
  }
  // 更新画布裁切区域：克隆当前 workspace 作为 clipPath（高度变化时跟随）
  // （已抽取至 workspaceGeometry.cloneWorkspaceAsClip 共享，供渲染器复用）
  _updateClipPath() {
    const ws = this.getWorkspase();
    if (!ws) return;
    cloneWorkspaceAsClip(ws, (cloned) => {
      this.canvas.clipPath = cloned;
      this.canvas.requestRenderAll();
    });
  }
  setZoomAuto(scale, cb) {
    const { workspaceEl } = this;
    const width = workspaceEl.offsetWidth;
    const height = workspaceEl.offsetHeight;
    this.canvas.setWidth(width);
    this.canvas.setHeight(height);
    const center = this.canvas.getCenter();
    this.canvas.setViewportTransform(fabric.iMatrix.concat());
    this.canvas.zoomToPoint(new fabric.Point(center.left, center.top), scale);
    if (!this.workspace) return;
    this.setCenterFromObject(this.workspace);
    // 超出画布不展示
    this.workspace.clone((cloned) => {
      this.canvas.clipPath = cloned;
      this.canvas.requestRenderAll();
    });
    if (cb) cb(this.workspace.left, this.workspace.top);
  }
  _getScale() {
    return fabric.util.findScaleToFit(this.getWorkspase(), {
      width: this.workspaceEl.offsetWidth,
      height: this.workspaceEl.offsetHeight,
    });
  }
  // 放大
  big() {
    let zoomRatio = this.canvas.getZoom();
    zoomRatio += 0.05;
    const center = this.canvas.getCenter();
    this.canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoomRatio);
  }
  // 缩小
  small() {
    let zoomRatio = this.canvas.getZoom();
    zoomRatio -= 0.05;
    const center = this.canvas.getCenter();
    this.canvas.zoomToPoint(
      new fabric.Point(center.left, center.top),
      zoomRatio < 0 ? 0.01 : zoomRatio
    );
  }
  // 自动缩放
  auto() {
    const scale = this._getScale();
    this.setZoomAuto(scale * this.zoomRatio);
  }
  // 1:1 放大
  one() {
    this.setZoomAuto(1 * this.zoomRatio);
    this.canvas.requestRenderAll();
  }
  setWorkspaseBg(color) {
    const workspase = this.getWorkspase();
    workspase === null || workspase === void 0 ? void 0 : workspase.set('fill', color);
  }
  // ================= 背景图 =================
  // 获取背景图对象
  _getBackgroundImageObj() {
    return this.canvas.getObjects().find((item) => item.id === 'backgroundImage') || null;
  }
  // 设置背景图（dataUrl：图片地址；mode：cover 填满 / contain 完整 / tile 平铺；position：{x,y} 对齐系数）
  setBackgroundImage(dataUrl, mode = 'cover', position) {
    const workspace = this.getWorkspase();
    if (!workspace || !dataUrl) {
      return;
    }
    // 变量背景分流：src 含变量时走占位呈现（真实图以预览/渲染为准）
    const vp = this.editor.getPlugin && this.editor.getPlugin('VariablePlugin');
    if (vp && vp.containsVariable && vp.containsVariable(dataUrl)) {
      this.setBackgroundVariableImage(dataUrl, mode, position);
      return;
    }
    // 移除旧的（会重置状态）
    this.removeBackgroundImage();
    this.backgroundImageMode = mode;
    this.backgroundImagePosition = position || { x: 0.5, y: 0.5 };
    // 请求 URL 追加「按接入域名分片缓存」参数（幂等）；对象元素 src 为带参 URL（保存时统一移除），
    // backgroundImageDataUrl 基准保持干净 URL，setBackgroundMode 重建时重新追加
    const requestUrl = appendCacheBustParam(
      dataUrl,
      this.editor && this.editor.options && this.editor.options.cacheBust
    );
    // CORS 回退加载：服务器无 Access-Control-* 时去掉 crossOrigin 重试（保显示，代价是画布被污染）
    const crossOrigin = normalizeCrossOrigin(
      this.editor && this.editor.options ? this.editor.options.crossOrigin : undefined
    );
    loadImageResilient(requestUrl, { crossOrigin })
      .then((img) => {
        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;
        if (!imgW || !imgH) {
          return;
        }
        this.backgroundImageSize = { w: imgW, h: imgH };
        this.backgroundImageDataUrl = dataUrl;
        const bgObj = this._createBackgroundObject(
          img,
          imgW,
          imgH,
          workspace,
          mode,
          this.backgroundImagePosition
        );
        const wsIndex = this.canvas.getObjects().indexOf(workspace);
        this.canvas.insertAt(bgObj, wsIndex + 1);
        bgObj.set('opacity', this.backgroundImageOpacity);
        this.canvas.requestRenderAll();
        // 显式记录历史（insertAt 仅触发 object:added，HistoryPlugin 不监听该事件）
        if (this.editor.saveState) {
          this.editor.saveState();
        }
      })
      .catch(() => {
        console.error('背景图加载失败', requestUrl);
      });
  }
  // 设置"变量背景"：以占位图铺满呈现（纯色底 + 矢量变量名叠加层），
  // src 保留变量 URL（序列化输出变量串而非占位 base64）；真实宽高比以预览/渲染为准。
  setBackgroundVariableImage(dataUrl, mode = 'cover', position) {
    const workspace = this.getWorkspase();
    const vp = this.editor.getPlugin && this.editor.getPlugin('VariablePlugin');
    if (!workspace || !dataUrl || !vp || typeof vp._makePlaceholder !== 'function') {
      return;
    }
    this.removeBackgroundImage();
    this.backgroundImageMode = mode;
    this.backgroundImagePosition = position || { x: 0.5, y: 0.5 };
    this.backgroundImageVariable = true;
    fabric.util.loadImage(
      vp._makePlaceholder(),
      (imgEl, isError) => {
        if (isError || !imgEl) {
          this.backgroundImageVariable = false;
          return;
        }
        const imgSize = {
          w: imgEl.naturalWidth || imgEl.width || 0,
          h: imgEl.naturalHeight || imgEl.height || 0,
        };
        const layout = computeBackgroundLayout({
          workspace,
          imageSize: imgSize,
          mode,
          position: this.backgroundImagePosition,
        });
        if (!layout) {
          this.backgroundImageVariable = false;
          return;
        }
        const bgObj = createBackgroundObject({ img: imgEl, layout, mode, position: this.backgroundImagePosition });
        bgObj.set('src', dataUrl);
        bgObj.set('isVariableBackground', true);
        bgObj.set('variableLabel', vp._extractVariableLabel(dataUrl));
        bgObj.set('showPlaceholderText', true);
        attachVariableOverlay(bgObj);
        if (vp._patchGetSrc) vp._patchGetSrc(bgObj);
        const wsIndex = this.canvas.getObjects().indexOf(workspace);
        this.canvas.insertAt(bgObj, wsIndex + 1);
        bgObj.set('opacity', this.backgroundImageOpacity);
        // 占位图尺寸作为设计期几何基准（真实尺寸未知；tile 形态不依赖尺寸）
        this.backgroundImageSize = imgSize;
        this.canvas.requestRenderAll();
        if (this.editor.saveState) {
          this.editor.saveState();
        }
      },
      this,
      'anonymous'
    );
  }
  // 计算背景对象布局（cover/contain 用 Image 的缩放与对齐，tile 用 Rect 铺满）
  // 供创建与就地同步复用；依赖 this.backgroundImageSize（原始像素尺寸）
  // （已抽取至 workspaceGeometry.computeBackgroundLayout 共享，供渲染器复用）
  _computeBackgroundLayout(workspace, mode, position) {
    return computeBackgroundLayout({
      workspace,
      imageSize: this.backgroundImageSize,
      mode,
      position: position || this.backgroundImagePosition || { x: 0.5, y: 0.5 },
    });
  }
  // 创建背景对象（cover/contain 用 Image，tile 用 Pattern 填充的 Rect）
  // （已抽取至 workspaceGeometry.createBackgroundObject 共享，供渲染器复用）
  _createBackgroundObject(img, imgW, imgH, workspace, mode, position) {
    const layout = this._computeBackgroundLayout(workspace, mode, position);
    if (!layout) return null;
    return createBackgroundObject({
      img,
      layout,
      mode,
      position: position || this.backgroundImagePosition || { x: 0.5, y: 0.5 },
    });
  }
  // 就地同步背景图尺寸/位置（同步执行、不重建对象，避免异步竞态与闪烁）
  _syncBackgroundImageSilent() {
    const obj = this._getBackgroundImageObj();
    const workspace = this.getWorkspase();
    if (!obj || !workspace) return;
    const mode = obj.backgroundImageMode || this.backgroundImageMode || 'cover';
    const position = obj.backgroundPosition || this.backgroundImagePosition || { x: 0.5, y: 0.5 };
    // 变量背景：优先用画布上元素的实时自然尺寸（预览期为真实图、设计期为占位图），
    // 否则预览期 autoGrow 增高时会按占位图尺寸算 scale（真实图会显示错）
    const imageSize = this.backgroundImageVariable
      ? this._getLiveBackgroundSize(obj)
      : this.backgroundImageSize;
    const layout = computeBackgroundLayout({ workspace, imageSize, mode, position });
    if (!layout) return;
    obj.set(layout);
    if (obj.setCoords) obj.setCoords();
  }
  // 读取背景对象当前元素的自然尺寸（image 形态）；失败回退设计期基准
  _getLiveBackgroundSize(obj) {
    if (obj && obj.type === 'image' && obj._element) {
      const el = obj._element;
      const w = el.naturalWidth || el.width || 0;
      const h = el.naturalHeight || el.height || 0;
      if (w > 0 && h > 0) return { w, h };
    }
    return this.backgroundImageSize;
  }
  // 就地更新背景图对齐方式（不重载图片）
  setBackgroundPosition(x, y) {
    this.backgroundImagePosition = { x, y };
    const obj = this._getBackgroundImageObj();
    if (obj) {
      obj.set('backgroundPosition', { x, y });
      this._syncBackgroundImageSilent();
      this.canvas.requestRenderAll();
      if (this.editor.saveState) {
        this.editor.saveState();
      }
    }
  }
  // 供其他插件（如 ResizePlugin 拖拽改尺寸）同步背景图
  syncBackgroundImage() {
    this._syncBackgroundImageSilent();
    this.canvas.requestRenderAll();
  }
  // 移除背景图
  removeBackgroundImage() {
    const obj = this._getBackgroundImageObj();
    if (obj) {
      this.canvas.remove(obj);
    }
    this.backgroundImageDataUrl = null;
    this.backgroundImageMode = 'cover';
    this.backgroundImagePosition = { x: 0.5, y: 0.5 };
    this.backgroundImageSize = null;
    this.backgroundImageVariable = false;
    this.canvas.requestRenderAll();
  }
  // 背景图透明度（0-1）
  setBackgroundOpacity(opacity) {
    this.backgroundImageOpacity = opacity;
    const obj = this._getBackgroundImageObj();
    if (obj) {
      obj.set('opacity', opacity);
      this.canvas.requestRenderAll();
    }
  }
  // 获取背景图信息（用于回显）
  getBackgroundImage() {
    const obj = this._getBackgroundImageObj();
    if (!obj) {
      return null;
    }
    let src = '';
    let mode = obj.backgroundImageMode || this.backgroundImageMode || 'cover';
    if (obj.type === 'image') {
      src = obj.getSrc();
    } else if (obj.type === 'rect' && obj.fill && obj.fill.source) {
      src = obj.fill.source.src;
      mode = 'tile';
    }
    return {
      src,
      mode,
      position: obj.backgroundPosition || this.backgroundImagePosition || { x: 0.5, y: 0.5 },
      opacity: obj.opacity,
      variable: this.backgroundImageVariable,
    };
  }
  // 导入后还原变量背景的编辑态呈现：
  // - image 形态由 VariablePlugin._restoreVariableImages 通用还原（占位图 + 叠加层）
  // - tile 形态（rect）：JSON 的 fill.source 是变量 URL（保存时顶替了占位 base64），
  //   fabric 直接加载必然失败，这里用占位图重建 Pattern，保证编辑态可见
  _restoreVariableBackgroundAfterImport() {
    const obj = this._getBackgroundImageObj();
    if (!obj || !(obj.get && obj.get('isVariableBackground') === true)) return;
    const vp = this.editor.getPlugin && this.editor.getPlugin('VariablePlugin');
    const src = obj.get('src');
    if (!vp || obj.type !== 'rect' || typeof src !== 'string' || !vp.containsVariable(src)) return;
    fabric.util.loadImage(
      vp._makePlaceholder(),
      (imgEl, isError) => {
        if (isError || !imgEl) return;
        replaceTilePatternSource(obj, imgEl, obj.fill && obj.fill.repeat);
        obj.dirty = true;
        this.canvas.requestRenderAll();
      },
      this,
      'anonymous'
    );
  }
  // 画布尺寸调整为背景图原始尺寸
  fitCanvasToBackground() {
    if (this.backgroundImageVariable) return; // 变量背景真实尺寸未知，禁止按背景定画布
    const size = this.backgroundImageSize;
    if (size && size.w && size.h) {
      this.setSize(size.w, size.h);
    }
  }
  // 就地更新背景图模式（不重载图片；变量背景亦安全，避免变量 URL 重建失败）
  setBackgroundMode(mode) {
    this.backgroundImageMode = mode;
    const obj = this._getBackgroundImageObj();
    if (obj) {
      obj.set('backgroundImageMode', mode);
      this._syncBackgroundImageSilent();
      this.canvas.requestRenderAll();
      if (this.editor.saveState) {
        this.editor.saveState();
      }
    }
  }
  // 画布尺寸变化后同步背景图
  _syncBackgroundImage() {
    if (this.backgroundImageVariable) {
      // 变量背景跳过异步重建（变量 URL 无法直接加载，重建即失败丢背景），就地同步占位布局
      this._syncBackgroundImageSilent();
      return;
    }
    if (this.backgroundImageDataUrl) {
      this.setBackgroundImage(
        this.backgroundImageDataUrl,
        this.backgroundImageMode,
        this.backgroundImagePosition
      );
    }
  }
  // 历史快照恢复后同步背景图状态（history:undo / history:redo 回调）
  _onHistoryRestore() {
    this._captureBackgroundImage();
    // 变量背景（tile 形态）快照中 fill.source 是变量 URL，需用占位图重建 Pattern
    this._restoreVariableBackgroundAfterImport();
  }
  // 从画布捕获背景图数据（loadJSON 后调用）
  _captureBackgroundImage() {
    const info = this.getBackgroundImage();
    if (info && info.src) {
      this.backgroundImageDataUrl = info.src;
      this.backgroundImageMode = info.mode;
      this.backgroundImagePosition = info.position;
      this.backgroundImageOpacity = info.opacity != null ? info.opacity : 1;
      // 变量标记从背景对象的序列化属性恢复（info.variable 是 backgroundImageVariable 自身，
      // 不能用来自赋值，否则导入变量背景后标记永远为 false）
      const obj = this._getBackgroundImageObj();
      this.backgroundImageVariable = !!(obj && obj.get && obj.get('isVariableBackground') === true);
      if (obj && obj.type === 'image') {
        const el = obj._element;
        this.backgroundImageSize = {
          w: (el && (el.naturalWidth || el.width)) || obj.width,
          h: (el && (el.naturalHeight || el.height)) || obj.height,
        };
      } else if (obj && obj.type === 'rect' && obj.fill && obj.fill.source) {
        const el = obj.fill.source;
        this.backgroundImageSize = {
          w: (el && (el.naturalWidth || el.width)) || obj.width,
          h: (el && (el.naturalHeight || el.height)) || obj.height,
        };
      }
    } else {
      this.backgroundImageDataUrl = null;
      this.backgroundImageSize = null;
      this.backgroundImageVariable = false;
    }
  }
  // 清空背景图状态（画布 clear 时调用）
  _clearBackgroundImageState() {
    this.backgroundImageDataUrl = null;
    this.backgroundImageMode = 'cover';
    this.backgroundImagePosition = { x: 0.5, y: 0.5 };
    this.backgroundImageOpacity = 1;
    this.backgroundImageSize = null;
    this.backgroundImageVariable = false;
  }
  _bindWheel() {
    this.canvas.on('mouse:wheel', function (opt) {
      const delta = opt.e.deltaY;
      let zoom = this.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 20) zoom = 20;
      if (zoom < 0.01) zoom = 0.01;
      const center = this.getCenter();
      this.zoomToPoint(new fabric.Point(center.left, center.top), zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
    });
  }
  destroy() {
    this.resizeObserver.disconnect();
    this.canvas.off();
    console.log('pluginDestroy');
  }
}
WorkspacePlugin.pluginName = 'WorkspacePlugin';
WorkspacePlugin.events = ['sizeChange'];
WorkspacePlugin.apis = [
  'big',
  'small',
  'auto',
  'one',
  'setSize',
  'setSizeSilent',
  'getWorkspase',
  'setWorkspaseBg',
  'setCenterFromObject',
  'setBackgroundImage',
  'setBackgroundVariableImage',
  'setBackgroundMode',
  'setBackgroundPosition',
  'removeBackgroundImage',
  'setBackgroundOpacity',
  'getBackgroundImage',
  'fitCanvasToBackground',
  'syncBackgroundImage',
];
export default WorkspacePlugin;
