/*
 * @Author: 秦少卫
 * @Date: 2023-06-27 12:26:41
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-12-24 13:13:06
 * @Description: 画布区域插件
 */
import { fabric } from 'fabric';
import { throttle } from 'lodash-es';
class WorkspacePlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this.workspace = null;
        this.backgroundImageDataUrl = null;
        this.backgroundImageMode = 'cover';
        this.backgroundImageOpacity = 1;
        this.backgroundImageSize = null;
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
            // 记录从 JSON 加载的背景图数据，供后续 resize 同步
            this._captureBackgroundImage();
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
        if (canvas.width === undefined || canvas.height === undefined || !viewportTransform)
            return;
        viewportTransform[4] = canvas.width / 2 - objCenter.x * viewportTransform[0];
        viewportTransform[5] = canvas.height / 2 - objCenter.y * viewportTransform[3];
        canvas.setViewportTransform(viewportTransform);
        canvas.renderAll();
    }
    // 初始化监听器
    _initResizeObserve() {
        const resizeObserver = new ResizeObserver(throttle(() => {
            this.auto();
        }, 50));
        this.resizeObserver = resizeObserver;
        this.resizeObserver.observe(this.workspaceEl);
    }
    setSize(width, height) {
        this._initBackground();
        this.option.width = width;
        this.option.height = height;
        // 重新设置workspace
        this.workspace = this.canvas
            .getObjects()
            .find((item) => item.id === 'workspace');
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
        this.workspace = this.canvas
            .getObjects()
            .find((item) => item.id === 'workspace');
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
    _updateClipPath() {
        const ws = this.getWorkspase();
        if (!ws) return;
        ws.clone((cloned) => {
            // 兜底：以最新 workspace 几何覆盖，避免异步乱序导致 clip 尺寸回退
            cloned.set({
                width: ws.get('width'),
                height: ws.get('height'),
                left: ws.get('left'),
                top: ws.get('top'),
                scaleX: ws.get('scaleX'),
                scaleY: ws.get('scaleY'),
            });
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
        if (!this.workspace)
            return;
        this.setCenterFromObject(this.workspace);
        // 超出画布不展示
        this.workspace.clone((cloned) => {
            this.canvas.clipPath = cloned;
            this.canvas.requestRenderAll();
        });
        if (cb)
            cb(this.workspace.left, this.workspace.top);
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
        this.canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoomRatio < 0 ? 0.01 : zoomRatio);
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
    // 设置背景图（dataUrl：图片地址；mode：cover 填满 / contain 完整 / tile 平铺）
    setBackgroundImage(dataUrl, mode = 'cover') {
        const workspace = this.getWorkspase();
        if (!workspace || !dataUrl) {
            return;
        }
        // 移除旧的（会重置状态）
        this.removeBackgroundImage();
        this.backgroundImageMode = mode;
        const img = new Image();
        img.onload = () => {
            const imgW = img.naturalWidth || img.width;
            const imgH = img.naturalHeight || img.height;
            if (!imgW || !imgH) {
                return;
            }
            this.backgroundImageSize = { w: imgW, h: imgH };
            this.backgroundImageDataUrl = dataUrl;
            const bgObj = this._createBackgroundObject(img, imgW, imgH, workspace, mode);
            const wsIndex = this.canvas.getObjects().indexOf(workspace);
            this.canvas.insertAt(bgObj, wsIndex + 1);
            bgObj.set('opacity', this.backgroundImageOpacity);
            this.canvas.requestRenderAll();
            // 显式记录历史（insertAt 仅触发 object:added，HistoryPlugin 不监听该事件）
            if (this.editor.saveState) {
                this.editor.saveState();
            }
        };
        img.onerror = () => {
            console.error('背景图加载失败');
        };
        img.src = dataUrl;
    }
    // 计算背景对象布局（cover/contain 用 Image 的缩放与居中，tile 用 Rect 铺满）
    // 供创建与就地同步复用；依赖 this.backgroundImageSize（原始像素尺寸）
    _computeBackgroundLayout(workspace, mode) {
        if (!workspace) return null;
        const rectW = workspace.width * workspace.scaleX;
        const rectH = workspace.height * workspace.scaleY;
        if (mode === 'tile') {
            return {
                left: workspace.left,
                top: workspace.top,
                width: rectW,
                height: rectH,
            };
        }
        const size = this.backgroundImageSize;
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
        return {
            left: workspace.left + (rectW - width) / 2,
            top: workspace.top + (rectH - height) / 2,
            scaleX: scale,
            scaleY: scale,
        };
    }
    // 创建背景对象（cover/contain 用 Image，tile 用 Pattern 填充的 Rect）
    _createBackgroundObject(img, imgW, imgH, workspace, mode) {
        const layout = this._computeBackgroundLayout(workspace, mode);
        if (!layout) return null;
        if (mode === 'tile') {
            const pattern = new fabric.Pattern({ source: img, repeat: 'repeat' });
            return new fabric.Rect({
                left: layout.left,
                top: layout.top,
                width: layout.width,
                height: layout.height,
                fill: pattern,
                id: 'backgroundImage',
                backgroundImageMode: 'tile',
                selectable: false,
                evented: false,
                hasControls: false,
                hoverCursor: 'default',
                lockMovementX: true,
                lockMovementY: true,
            });
        }
        return new fabric.Image(img, {
            left: layout.left,
            top: layout.top,
            scaleX: layout.scaleX,
            scaleY: layout.scaleY,
            id: 'backgroundImage',
            backgroundImageMode: mode,
            selectable: false,
            evented: false,
            hasControls: false,
            hoverCursor: 'default',
            lockMovementX: true,
            lockMovementY: true,
        });
    }
    // 就地同步背景图尺寸/位置（同步执行、不重建对象，避免异步竞态与闪烁）
    _syncBackgroundImageSilent() {
        const obj = this._getBackgroundImageObj();
        const workspace = this.getWorkspase();
        if (!obj || !workspace) return;
        const mode = obj.backgroundImageMode || this.backgroundImageMode || 'cover';
        const layout = this._computeBackgroundLayout(workspace, mode);
        if (!layout) return;
        obj.set(layout);
        if (obj.setCoords) obj.setCoords();
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
        this.backgroundImageSize = null;
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
            opacity: obj.opacity,
        };
    }
    // 画布尺寸调整为背景图原始尺寸
    fitCanvasToBackground() {
        const size = this.backgroundImageSize;
        if (size && size.w && size.h) {
            this.setSize(size.w, size.h);
        }
    }
    // 画布尺寸变化后同步背景图
    _syncBackgroundImage() {
        if (this.backgroundImageDataUrl) {
            this.setBackgroundImage(this.backgroundImageDataUrl, this.backgroundImageMode);
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
            this.backgroundImageOpacity = info.opacity != null ? info.opacity : 1;
            const obj = this._getBackgroundImageObj();
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
        }
    }
    // 清空背景图状态（画布 clear 时调用）
    _clearBackgroundImageState() {
        this.backgroundImageDataUrl = null;
        this.backgroundImageMode = 'cover';
        this.backgroundImageOpacity = 1;
        this.backgroundImageSize = null;
    }
    _bindWheel() {
        this.canvas.on('mouse:wheel', function (opt) {
            const delta = opt.e.deltaY;
            let zoom = this.getZoom();
            zoom *= 0.999 ** delta;
            if (zoom > 20)
                zoom = 20;
            if (zoom < 0.01)
                zoom = 0.01;
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
    'removeBackgroundImage',
    'setBackgroundOpacity',
    'getBackgroundImage',
    'fitCanvasToBackground',
    'syncBackgroundImage',
];
export default WorkspacePlugin;
