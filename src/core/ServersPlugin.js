/*
 * @Author: 秦少卫
 * @Date: 2023-06-20 12:52:09
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-25 17:40:14
 * @Description: 内部插件
 */
import { v4 as uuid } from 'uuid';
import { selectFiles, clipboardText, downFile } from './utils/utils';
import { fabric } from 'fabric';
import { SelectEvent, SelectMode } from './eventType';
function transformText(objects) {
    if (!objects)
        return;
    objects.forEach((item) => {
        if (item.objects) {
            transformText(item.objects);
        }
        else {
            item.type === 'text' && (item.type = 'textbox');
        }
    });
}
class ServersPlugin {
    // public hotkeys: string[] = ['left', 'right', 'down', 'up'];
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this.selectedMode = SelectMode.EMPTY;
        this._initSelectEvent();
    }
    _initSelectEvent() {
        this.canvas.on('selection:created', () => this._emitSelectEvent());
        this.canvas.on('selection:updated', () => this._emitSelectEvent());
        this.canvas.on('selection:cleared', () => this._emitSelectEvent());
    }
    _emitSelectEvent() {
        if (!this.canvas) {
            throw TypeError('还未初始化');
        }
        const actives = this.canvas
            .getActiveObjects()
            .filter((item) => !(item instanceof fabric.GuideLine)); // 过滤掉辅助线
        if (actives && actives.length === 1) {
            this.selectedMode = SelectMode.ONE;
            this.editor.emit(SelectEvent.ONE, actives);
        }
        else if (actives && actives.length > 1) {
            this.selectedMode = SelectMode.MULTI;
            this.editor.emit(SelectEvent.MULTI, actives);
        }
        else {
            this.selectedMode = SelectMode.EMPTY;
            this.editor.emit(SelectEvent.CANCEL);
        }
    }
    getSelectMode() {
        return String(this.selectedMode);
    }
    insert(callback) {
        selectFiles({ accept: '.json' }).then((files) => {
            if (files && files.length > 0) {
                const file = files[0];
                const reader = new FileReader();
                reader.readAsText(file, 'UTF-8');
                reader.onload = () => {
                    this.loadJSON(reader.result, callback);
                };
            }
        });
    }
    // 设置path属性
    renderITextPath(textPaths) {
        textPaths.forEach((item) => {
            const object = this.canvas.getObjects().find((o) => o.id === item.id);
            if (object) {
                fabric.Path.fromObject(item.path, (e) => {
                    object.set('path', e);
                });
            }
        });
    }
    async loadJSON(jsonFile, callback) {
        // 确保元素存在id
        const temp = typeof jsonFile === 'string' ? JSON.parse(jsonFile) : jsonFile;
        const textPaths = [];
        temp.objects.forEach((item) => {
            !item.id && (item.id = uuid());
            // 收集所有路径文本元素i-text，并设置path为null
            if (item.type === 'i-text' && item.path) {
                textPaths.push({ id: item.id, path: item.path });
                item.path = null;
            }
        });
        // hookTransform遍历
        const tempTransform = await this._transform(temp);
        jsonFile = JSON.stringify(tempTransform);
        // 加载前钩子
        this.editor.hooksEntity.hookImportBefore.callAsync(jsonFile, () => {
            this.canvas.loadFromJSON(jsonFile, () => {
                // 把i-text对应的path加上
                this.renderITextPath(textPaths);
                this.canvas.renderAll();
                // 加载后钩子
                this.editor.hooksEntity.hookImportAfter.callAsync(jsonFile, () => {
                    var _a;
                    // 修复导入带水印的json无法清除问题 #359
                    ((_a = this.editor) === null || _a === void 0 ? void 0 : _a.updateDrawStatus) &&
                        typeof this.editor.updateDrawStatus === 'function' &&
                        this.editor.updateDrawStatus(!!temp['overlayImage']);
                    this.canvas.renderAll();
                    callback && callback();
                    this.editor.emit('loadJson');
                });
            });
        });
    }
    async _transform(json) {
        await this.promiseCallAsync(json);
        if (json.objects) {
            const all = json.objects.map((item) => {
                return this._transform(item);
            });
            await Promise.all(all);
        }
        return json;
    }
    promiseCallAsync(item) {
        return new Promise((resolve) => {
            this.editor.hooksEntity.hookTransform.callAsync(item, () => {
                resolve(item);
            });
        });
    }
    getJson() {
        const keys = this.getExtensionKey();
        return this.canvas.toJSON(keys);
    }
    getExtensionKey() {
        return [
            'id',
            'gradientAngle',
            'selectable',
            'hasControls',
            'editable',
            'extensionType',
            'extension',
            'verticalAlign',
            'roundValue',
            'backgroundImageMode',
        ];
    }
    /**
     * @description: 拖拽添加到画布
     * @param {Event} event
     * @param {Object} item
     */
    dragAddItem(item, event) {
        if (event) {
            const { left, top } = this.canvas.getSelectionElement().getBoundingClientRect();
            if (event.x < left || event.y < top || item.width === undefined)
                return;
            const point = {
                x: event.x - left,
                y: event.y - top,
            };
        const pointerVpt = this.canvas.restorePointerVpt(point);
        item.left = pointerVpt.x - item.width / 2;
        item.top = pointerVpt.y;
    }
    this.canvas.add(item);
        this.canvas.setActiveObject(item);
        !event && this.editor.position('center');
        this.canvas.requestRenderAll();
    }
    clipboard() {
        const jsonStr = this.getJson();
        return clipboardText(JSON.stringify(jsonStr));
    }
    async clipboardBase64() {
        const dataUrl = await this.preview();
        return clipboardText(dataUrl);
    }
    // 复制当前选中元素的 JSON 到剪贴板
    copyActiveObjectJson() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject) {
            console.warn('copyActiveObjectJson: no active object selected');
            return Promise.resolve(false);
        }
        const json = activeObject.toJSON(['id', 'gradientAngle', 'selectable', 'hasControls']);
        return clipboardText(JSON.stringify(json)).then(() => true);
    }
    async saveJson() {
        const dataUrl = this.getJson();
        // 把文本text转为textgroup，让导入可以编辑
        await transformText(dataUrl.objects);
        const fileStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataUrl))}`;
        downFile(fileStr, 'json');
    }
    saveSvg() {
        this.editor.hooksEntity.hookSaveBefore.callAsync('', () => {
            const { fontOption, svgOption } = this._getSaveSvgOption();
            fabric.fontPaths = {
                ...fontOption,
            };
            const dataUrl = this.canvas.toSVG(svgOption);
            const fileStr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dataUrl)}`;
            this.editor.hooksEntity.hookSaveAfter.callAsync(fileStr, () => {
                downFile(fileStr, 'svg');
            });
        });
    }
    saveImg() {
        this.editor.hooksEntity.hookSaveBefore.callAsync('', () => {
            const option = this._getSaveOption();
            this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
            const dataUrl = this.canvas.toDataURL(option);
            this.editor.hooksEntity.hookSaveAfter.callAsync(dataUrl, () => {
                downFile(dataUrl, 'png');
            });
        });
    }
    preview() {
        return new Promise((resolve) => {
            this.editor.hooksEntity.hookSaveBefore.callAsync('', () => {
                const option = this._getSaveOption();
                this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
                this.canvas.renderAll();
                const dataUrl = this.canvas.toDataURL(option);
                this.editor.hooksEntity.hookSaveAfter.callAsync(dataUrl, () => {
                    resolve(dataUrl);
                });
            });
        });
    }
    _getSaveSvgOption() {
        const workspace = this.canvas.getObjects().find((item) => item.id === 'workspace');
        let fontFamilyArry = this.canvas
            .getObjects()
            .filter((item) => item.type == 'textbox')
            .map((item) => item.fontFamily);
        fontFamilyArry = Array.from(new Set(fontFamilyArry));
        const fontList = this.editor.getPlugin('FontPlugin').cacheList;
        const fontEntry = {};
        for (const font of fontFamilyArry) {
            const item = fontList.find((item) => item.name === font);
            fontEntry[font] = item.file;
        }
        console.log('_getSaveSvgOption', fontEntry);
        const { left, top, width, height } = workspace;
        return {
            fontOption: fontEntry,
            svgOption: {
                width,
                height,
                viewBox: {
                    x: left,
                    y: top,
                    width,
                    height,
                },
            },
        };
    }
    _getSaveOption() {
        const workspace = this.canvas
            .getObjects()
            .find((item) => item.id === 'workspace');
        console.log('getObjects', this.canvas.getObjects());
        const { left, top, width, height } = workspace;
        const option = {
            name: 'New Image',
            format: 'png',
            quality: 1,
            width,
            height,
            left,
            top,
        };
        return option;
    }
    clear() {
        var _a;
        this.canvas.getObjects().forEach((obj) => {
            if (obj.id !== 'workspace') {
                this.canvas.remove(obj);
            }
        });
        (_a = this.editor) === null || _a === void 0 ? void 0 : _a.setWorkspaseBg('#fff');
        // 重置背景图状态
        const workspacePlugin = this.editor && this.editor.getPlugin('WorkspacePlugin');
        workspacePlugin && workspacePlugin._clearBackgroundImageState && workspacePlugin._clearBackgroundImageState();
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
        this.editor.emit('clear');
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
ServersPlugin.pluginName = 'ServersPlugin';
ServersPlugin.apis = [
    'insert',
    'loadJSON',
    'getJson',
    'dragAddItem',
    'clipboard',
    'clipboardBase64',
    'copyActiveObjectJson',
    'saveJson',
    'saveSvg',
    'saveImg',
    'clear',
    'preview',
    'getSelectMode',
    'getExtensionKey',
];
ServersPlugin.events = [SelectMode.ONE, SelectMode.MULTI, SelectEvent.CANCEL];
export default ServersPlugin;
