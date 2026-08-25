/*
 * @Author: cyc
 * @Date: 2026-08-25 16:39:18
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * textbox 尺寸交互差异化插件：
 * - 选中 textbox 时根据 clipEnabled 控制 mt/mb 手柄可见性
 * - 兜底：对非常规进入的 scale（如组内缩放、取消组合）做 scale -> width/frameHeight 归一化
 */
class TextClipPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this._onObjectModified = (e) => {
            const obj = e && e.target;
            if (!obj || obj.type !== 'textbox') {
                return;
            }
            this._normalizeTextbox(obj);
        };
        this._onSelection = (e) => this._updateControls(e);
        this._bindObjectModified();
        this._bindSelection();
    }
    // 兜底归一化：scale -> width / frameHeight
    _normalizeTextbox(obj) {
        if (obj.type !== 'textbox') {
            return;
        }
        if (obj.scaleX === 1 && obj.scaleY === 1) {
            return;
        }
        const newW = obj.getScaledWidth();
        const newH = obj.getScaledHeight();
        obj.set({
            scaleX: 1,
            scaleY: 1,
            width: newW,
        });
        if (obj.clipEnabled) {
            obj.setFrameHeight(newH);
        }
        else {
            obj.initDimensions && obj.initDimensions();
        }
        this.canvas.requestRenderAll();
    }
    _bindObjectModified() {
        this.canvas.on('object:modified', this._onObjectModified);
    }
    _bindSelection() {
        this.canvas.on('selection:created', this._onSelection);
        this.canvas.on('selection:updated', this._onSelection);
    }
    _updateControls(e) {
        const obj = e && e.selected && e.selected[0];
        if (!obj || obj.type !== 'textbox') {
            return;
        }
        // 尺寸锁关闭时高度自适应，隐藏上下手柄避免无效拖拽
        obj.setControlsVisibility({
            mt: !!obj.clipEnabled,
            mb: !!obj.clipEnabled,
        });
        this.canvas.requestRenderAll();
    }
    destroy() {
        this.canvas.off('object:modified', this._onObjectModified);
        this.canvas.off('selection:created', this._onSelection);
        this.canvas.off('selection:updated', this._onSelection);
    }
}
TextClipPlugin.pluginName = 'TextClipPlugin';
export default TextClipPlugin;
