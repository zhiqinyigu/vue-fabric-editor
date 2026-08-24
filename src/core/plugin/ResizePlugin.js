/*
 * @Author: wuchenguang1998
 * @Date: 2024-06-17 21:00:00
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-30 20:01:36
 * @Description: 画布resize拖拽插件
 */
import { throttle } from 'lodash-es';
import '../styles/resizePlugin.css';
class ResizePlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        // 最小画布尺寸
        this.minSize = { width: 1, height: 1 };
        // 控制条
        this.barOpts = {
            bWidth: 30,
            bHeight: 6,
            bPadding: 10, // 离画布边缘的距离
        };
        this.hasCreatedBar = false;
        this.isDragging = false;
        this.dragEl = null;
        this.startPoints = { x: 0, y: 0 };
        this.barOffset = { x: 0, y: 0 };
        this.wsOffset = {
            left: 0,
            top: 0,
            width: 0,
            height: 0,
        };
        // 事件句柄缓存
        this.eventHandler = {
            render: throttle(this.renderBars.bind(this), 50),
            onDragging: throttle(this.onDragging.bind(this), 30),
        };
        this._init();
        this._initResizeObserve();
        this._addListeners();
    }
    _init() {
        const workspaceEl = document.querySelector('#workspace');
        if (!workspaceEl) {
            throw new Error('element #workspace is missing, plz check!');
        }
        this.workspaceEl = workspaceEl;
    }
    // 初始化监听器
    _initResizeObserve() {
        const resizeObserver = new ResizeObserver(throttle(() => {
            this.renderBars();
        }, 50));
        resizeObserver.observe(this.workspaceEl);
    }
    // 渲染控制条具体位置
    renderBars() {
        const viewportTransform = this.canvas.viewportTransform;
        const [scaleX, , , scaleY, offsetX, offsetY] = viewportTransform || [];
        const workspace = this.getWorkspase();
        const wsWidth = workspace.width * scaleX;
        const wsHeight = workspace.height * scaleY;
        const wsLeft = workspace.left * scaleX;
        const wsTop = workspace.top * scaleY;
        const { bWidth, bHeight, bPadding } = this.barOpts;
        if (!viewportTransform)
            return;
        // 左控制条
        const leftBar = this._getBarFromType('left');
        leftBar.style.left = `${offsetX + wsLeft - bHeight - bPadding}px`;
        leftBar.style.top = `${offsetY + wsTop + wsHeight / 2 - bWidth / 2}px`;
        // 右控制条
        const rightBar = this._getBarFromType('right');
        rightBar.style.left = `${offsetX + wsLeft + wsWidth + bPadding}px`;
        rightBar.style.top = `${offsetY + wsTop + wsHeight / 2 - bWidth / 2}px`;
        // 上控制条
        const topBar = this._getBarFromType('top');
        topBar.style.left = `${offsetX + wsLeft + wsWidth / 2 - bWidth / 2}px`;
        topBar.style.top = `${offsetY + wsTop - bHeight - bPadding}px`;
        // 下控制条
        const bottomBar = this._getBarFromType('bottom');
        bottomBar.style.left = `${offsetX + wsLeft + wsWidth / 2 - bWidth / 2}px`;
        bottomBar.style.top = `${offsetY + wsTop + wsHeight + bPadding}px`;
        // 监听
        if (!this.hasCreatedBar) {
            this.hasCreatedBar = true;
            this._watchDrag();
        }
    }
    // 获取或创建控制条
    _getBarFromType(type) {
        let bar = document.querySelector(`#resize-${type}-bar`);
        if (bar)
            return bar;
        bar = document.createElement('div');
        bar.id = `resize-${type}-bar`;
        bar.className = 'resize-bar';
        if (['left', 'right'].includes(type)) {
            bar.classList.add('horizontal');
        }
        else {
            bar.classList.add('vertical');
        }
        this.workspaceEl.appendChild(bar);
        return bar;
    }
    // 监听拖拽相关事件
    _watchDrag() {
        const barList = Array.from(document.getElementsByClassName('resize-bar'));
        barList.forEach((bar) => {
            bar.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                this.dragEl = bar;
                this.dragEl.classList.add('active');
                this.startPoints = {
                    x: e.clientX,
                    y: e.clientY,
                };
                this.barOffset = {
                    x: bar.offsetLeft,
                    y: bar.offsetTop,
                };
                const workspace = this.getWorkspase();
                const { width, height, left, top } = workspace;
                this.wsOffset = { width, height, left, top };
            });
        });
        document.addEventListener('mousemove', this.eventHandler.onDragging);
        document.addEventListener('mouseup', () => {
            if (this.isDragging && this.dragEl) {
                this.isDragging = false;
                this.dragEl.classList.remove('active');
                this.dragEl = null;
                this.canvas.defaultCursor = 'default';
            }
        });
    }
    // 拖拽更新控制条及画布
    onDragging(e) {
        if (this.isDragging && this.dragEl) {
            const workspace = this.getWorkspase();
            const viewportTransform = this.canvas.viewportTransform;
            const [scaleX, , , scaleY] = viewportTransform || [];
            const deltaX = e.clientX - this.startPoints.x;
            const deltaY = e.clientY - this.startPoints.y;
            const deltaViewX = deltaX / scaleX;
            const deltaViewY = deltaY / scaleY;
            const type = this.dragEl.id.split('-')[1];
            let tempLength = 0;
            switch (type) {
                case 'left':
                    tempLength = Math.round(this.wsOffset.width - deltaViewX * 2);
                    if (tempLength >= this.minSize.width) {
                        this.dragEl.style.left = `${this.barOffset.x + deltaX}px`;
                        workspace.set('left', this.wsOffset.left + deltaViewX * 2);
                        workspace.set('width', tempLength);
                    }
                    else {
                        workspace.set('left', this.wsOffset.left + this.wsOffset.width - this.minSize.width);
                        workspace.set('width', this.minSize.width);
                    }
                    break;
                case 'right':
                    tempLength = Math.round(this.wsOffset.width + deltaViewX * 2);
                    if (tempLength >= this.minSize.width) {
                        this.dragEl.style.left = `${this.barOffset.x + deltaX}px`;
                        workspace.set('width', tempLength);
                    }
                    else {
                        workspace.set('width', this.minSize.width);
                    }
                    break;
                case 'top':
                    tempLength = Math.round(this.wsOffset.height - deltaViewY * 2);
                    if (tempLength >= this.minSize.height) {
                        this.dragEl.style.top = `${this.barOffset.y + deltaY}px`;
                        workspace.set('top', this.wsOffset.top + deltaViewY * 2);
                        workspace.set('height', tempLength);
                    }
                    else {
                        workspace.set('top', this.wsOffset.top + this.wsOffset.height - this.minSize.height);
                        workspace.set('height', this.minSize.height);
                    }
                    break;
                case 'bottom':
                    tempLength = Math.round(this.wsOffset.height + deltaViewY * 2);
                    if (tempLength >= this.minSize.height) {
                        this.dragEl.style.top = `${this.barOffset.y + deltaY}px`;
                        workspace.set('height', tempLength);
                    }
                    else {
                        workspace.set('height', this.minSize.height);
                    }
                    break;
                default:
                    break;
            }
            this.editor.setCenterFromObject(workspace);
            workspace.clone((cloned) => {
                this.canvas.clipPath = cloned;
                this.canvas.requestRenderAll();
            });
            // 拖拽改尺寸后同步背景图尺寸（就地更新，避免异步重建的闪烁）
            const wp = this.editor.getPlugin && this.editor.getPlugin('WorkspacePlugin');
            if (wp && wp.syncBackgroundImage) {
                wp.syncBackgroundImage();
            }
            if (['left', 'right'].includes(type)) {
                this.canvas.defaultCursor = 'ew-resize';
            }
            else {
                this.canvas.defaultCursor = 'ns-resize';
            }
            this.editor.emit('sizeChange', workspace.width, workspace.height);
        }
    }
    // 监听画布渲染
    _addListeners() {
        this.canvas.on('after:render', this.eventHandler.render);
    }
    // 返回workspace对象
    getWorkspase() {
        return this.canvas.getObjects().find((item) => item.id === 'workspace');
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
ResizePlugin.pluginName = 'ResizePlugin';
ResizePlugin.events = [];
ResizePlugin.apis = [];
export default ResizePlugin;
