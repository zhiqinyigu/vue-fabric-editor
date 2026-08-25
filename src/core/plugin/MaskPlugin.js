/*
 * @Author: MOmo
 * @Date: 2024-07-12 15:10:02
 * @LastEditors: MOmo
 * @LastEditTime: 2024-07-12 15:15:45
 * @Description: 画布蒙层插件
 */
import { fabric } from 'fabric';
class MaskPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this.coverMask = null;
        this.workspace = null;
        this.hackFlag = false;
        this.init();
    }
    init() {
        const workspaceEl = document.querySelector('#workspace');
        if (!workspaceEl) {
            throw new Error('element #workspace is missing, plz check!');
        }
        this.workspaceEl = workspaceEl;
    }
    /**
     * @desc 蒙版开关
     * @param val Boolean false
     */
    workspaceMaskToggle() {
        var _a;
        const workspaceMask = this.getWorkspaceMask();
        if (!workspaceMask) {
            this.initMask();
        }
        else {
            // 如果有 则删除
            workspaceMask && this.canvas.remove(workspaceMask);
            (_a = this.workspace) === null || _a === void 0 ? void 0 : _a.clone((cloned) => {
                this.canvas.clipPath = cloned;
                this.coverMask = null;
                this.canvas.requestRenderAll();
            });
            this.editor.off('loadJson', this.initMask);
        }
    }
    /**
     * @desc 获取蒙版开关
     */
    getworkspaceMaskStatus() {
        return this.coverMask !== null;
    }
    /**
     * @desc 获取蒙版
     * @returns Object
     */
    getWorkspaceMask() {
        return this.canvas.getObjects().find((item) => item.id === 'coverMask');
    }
    // 返回workspace对象
    getWorkspase() {
        return this.canvas.getObjects().find((item) => item.id === 'workspace');
    }
    setCoverMask(hack = false) {
        if (!this.coverMask || !this.workspace) {
            return;
        }
        const center = this.canvas.getCenter();
        const zoom = this.canvas.getZoom();
        let zoomToPointNumber = zoom;
        if (hack) {
            // 比较hack的方法，判断为fabric内部的数据更新问题
            zoomToPointNumber += 0.0000001 * (this.hackFlag ? 1 : -1);
            this.hackFlag = !this.hackFlag;
        }
        this.canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoomToPointNumber);
        if (zoom) {
            const { workspaceEl } = this;
            const width = workspaceEl.offsetWidth;
            const height = workspaceEl.offsetHeight;
            const cWidth = width / zoom;
            const cHeight = height / zoom;
            this.coverMask.width = cWidth;
            this.coverMask.height = cHeight;
            this.coverMask.left = (this.workspace.left || 0) + (this.workspace.width - cWidth) / 2;
            this.coverMask.top = (this.workspace.top || 0) + (this.workspace.height - cHeight) / 2;
            this.workspace.clone((clone) => {
                clone.left = -clone.width / 2;
                clone.top = -clone.height / 2;
                clone.inverted = true;
                this.coverMask.clipPath = clone;
                this.canvas.requestRenderAll();
            });
        }
    }
    initMask(needBindLoadJSON = true) {
        this.workspace = this.getWorkspase();
        if (!this.workspace) {
            throw new Error('MaskPlugin must be used after WorkspacePlugin!');
        }
        const coverMask = new fabric.Rect({
            fill: 'rgba(0,0,0,0.5)',
            id: 'coverMask',
            strokeWidth: 0,
        });
        coverMask.set('selectable', false);
        coverMask.set('hasControls', false);
        coverMask.set('evented', false);
        coverMask.hoverCursor = 'default';
        this.canvas.on('object:added', () => {
            coverMask.bringToFront();
        });
        this.canvas.clipPath = undefined;
        this.canvas.add(coverMask);
        this.coverMask = coverMask;
        this.setCoverMask();
        // 适配模板和psd的loadjson，在加载完成后再入mask
        needBindLoadJSON && this.editor.on('loadJson', () => this.initMask(false));
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
MaskPlugin.pluginName = 'MaskPlugin';
MaskPlugin.apis = ['setCoverMask', 'workspaceMaskToggle', 'getworkspaceMaskStatus'];
export default MaskPlugin;
