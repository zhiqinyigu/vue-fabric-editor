/*
 * @Author: 秦少卫
 * @Date: 2023-06-20 13:06:31
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-12 21:35:16
 * @Description: 历史记录插件（undo/redo 状态管理）
 */
import diagnoseSerializeError from '../utils/serializeDiagnose';

class HistoryPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        // 历史记录相关属性
        this.stack = [];
        this.currentIndex = 0;
        this.maxLength = 100;
        this.isProcessing = false;
        this.isLoading = false;
        this.hotkeys = ['ctrl+z', 'ctrl+shift+z', '⌘+z', '⌘+shift+z'];
        this._init();
    }
    _init() {
        // 监听对象变更事件
        const events = {
            'object:removed': () => this.saveState(),
            'object:modified': () => this.saveState(),
            'object:skewing': () => this.saveState(),
        };
        // 绑定事件
        Object.entries(events).forEach(([event, handler]) => {
            this.canvas.on(event, handler);
        });
        // 初始化状态
        this.saveState();
        // 更新历史记录状态
        this.canvas.on('history:append', () => {
            this.historyUpdate();
        });
        // 页面离开提示（保存句柄以便宿主解除，如保存回传后自动关闭标签页的场景）
        this._beforeUnloadHandler = (e) => {
            const { undoCount } = this.getState();
            if (undoCount > 0) {
                (e || window.event).returnValue = '确认离开';
            }
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }
    // 解除离开提示，允许脚本静默关闭/离开页面（须已保存，防丢守卫仅在未保存时有意义）
    allowClose() {
        if (!this._beforeUnloadHandler) return;
        window.removeEventListener('beforeunload', this._beforeUnloadHandler);
        this._beforeUnloadHandler = null;
    }
    // 获取当前状态
    getCurrentState() {
        return this.editor.getJson();
    }
    // 保存状态
    saveState() {
        if (this.isProcessing)
            return;
        try {
            // 清除当前索引后的记录
            this.stack.splice(this.currentIndex);
            this.stack.push(this.getCurrentState());
        } catch (err) {
            // getJson 序列化崩溃（如文本对象 styles undefined）：逐对象定位后原样上抛，
            // 保持调用方（object:modified 等）的错误语义不变
            diagnoseSerializeError(err, this.canvas);
            throw err;
        }
        // 维护最大长度
        if (this.stack.length > this.maxLength) {
            this.stack.shift();
        }
        else {
            this.currentIndex++;
        }
        this.historyUpdate();
    }
    // 加载状态
    _loadState(state, eventName, callback) {
        var _a;
        this.isLoading = true;
        this.isProcessing = true;
        // 处理 workspace 的特殊情况
        const parsedState = JSON.parse(state);
        const workspace = (_a = parsedState.objects) === null || _a === void 0 ? void 0 : _a.find((item) => item.id === 'workspace');
        if (workspace) {
            workspace.evented = false;
        }
        this.canvas.loadFromJSON(state, () => {
            this.canvas.renderAll();
            this.canvas.fire(eventName);
            this.isProcessing = false;
            this.isLoading = false;
            callback === null || callback === void 0 ? void 0 : callback();
        });
    }
    // 获取历史记录状态
    getState() {
        return {
            undoCount: this.currentIndex - 1,
            redoCount: this.stack.length - this.currentIndex,
        };
    }
    // 清空历史记录
    clear() {
        this.stack = [];
        this.currentIndex = 0;
        this.saveState();
    }
    // 公开方法
    historyUpdate() {
        const { undoCount, redoCount } = this.getState();
        this.editor.emit('historyUpdate', undoCount, redoCount);
    }
    hookImportAfter() {
        this.clear();
        this.historyUpdate();
        return Promise.resolve();
    }
    undo() {
        if (this.isLoading || this.currentIndex <= 1)
            return;
        this.currentIndex--;
        const state = this.stack[this.currentIndex - 1];
        if (state) {
            this._loadState(JSON.stringify(state), 'history:undo');
            this.historyUpdate();
        }
    }
    redo() {
        if (this.isLoading || this.currentIndex >= this.stack.length)
            return;
        const state = this.stack[this.currentIndex];
        if (state) {
            this._loadState(JSON.stringify(state), 'history:redo');
            this.currentIndex++;
            this.historyUpdate();
        }
    }
    hotkeyEvent(eventName, e) {
        if (e.type === 'keydown') {
            switch (eventName) {
                case 'ctrl+z':
                case '⌘+z':
                    this.undo();
                    break;
                case 'ctrl+shift+z':
                case '⌘+shift+z':
                    this.redo();
                    break;
            }
        }
    }
    clearAndSaveState() {
        const currentState = this.getCurrentState();
        this.stack = [currentState]; // 只保留当前状态作为第一条记录
        this.currentIndex = 1;
        this.historyUpdate();
    }
}
HistoryPlugin.pluginName = 'HistoryPlugin';
HistoryPlugin.apis = ['undo', 'redo', 'historyUpdate', 'clearAndSaveState', 'saveState'];
HistoryPlugin.events = [];
export default HistoryPlugin;
