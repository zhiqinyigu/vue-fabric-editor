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
    // 创建背景对象（cover/contain 用 Image，tile 用 Pattern 填充的 Rect）
    _createBackgroundObject(img, imgW, imgH, workspace, mode) {
        const rectW = workspace.width * workspace.scaleX;
        const rectH = workspace.height * workspace.scaleY;
        if (mode === 'tile') {
            const pattern = new fabric.Pattern({ source: img, repeat: 'repeat' });
            return new fabric.Rect({
                left: workspace.left,
                top: workspace.top,
                width: rectW,
                height: rectH,
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
        return new fabric.Image(img, {
            left: workspace.left + (rectW - width) / 2,
            top: workspace.top + (rectH - height) / 2,
            scaleX: scale,
            scaleY: scale,
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
    'getWorkspase',
    'setWorkspaseBg',
    'setCenterFromObject',
    'setBackgroundImage',
    'removeBackgroundImage',
    'setBackgroundOpacity',
    'getBackgroundImage',
    'fitCanvasToBackground',
];
export default WorkspacePlugin;
