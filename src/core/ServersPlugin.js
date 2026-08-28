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
import { stripDefaultFields, stripCanvasDefaults, normalizeCanvasDefaults, patchImageCrossOrigin, appendImagesCacheBustParam, removeImagesCacheBustParam } from './jsonOptimizer';
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
    async loadJSON(jsonFile, callback, crossOrigin = 'anonymous') {
        if (this._engineDestroyed()) {
            callback && callback();
            return;
        }
        // 确保元素存在id
        const temp = typeof jsonFile === 'string' ? JSON.parse(jsonFile) : jsonFile;
        // 资源清单还原：assetId 引用 -> 内联 src（供 hookTransform / loadFromJSON 使用）
        this._expandAssetManifest(temp);
        // 精简 JSON 缺省字段补回（与 getJson 的 strip 对称，保证 1:1 还原）
        normalizeCanvasDefaults(temp);
        // 远程图片补 crossOrigin，避免 canvas 被污染导致 toDataURL 导出 SecurityError。
        // 后端不支持 CORS 时可传 null 关闭（此时仅可显示、不可导出）。
        if (crossOrigin) {
            patchImageCrossOrigin(temp, crossOrigin);
        }
        // 远程图片「按接入域名分片缓存」：加载前给远程 URL 追加 feDomain=当前接入域名（请求态分片，
        // CDN 按域名分片返回 access-control-allow-* 并隔离缓存）；JSON 存储态保持干净 URL，
        // getJson 保存时对称移除；editor.options.cacheBust 传 false 可关闭，传 { param, getValue } 可自定义
        appendImagesCacheBustParam(temp, this.editor && this.editor.options && this.editor.options.cacheBust);
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
        if (this._engineDestroyed()) {
            callback && callback();
            return;
        }
        // 加载前钩子
        this.editor.hooksEntity.hookImportBefore.callAsync(jsonFile, () => {
            this.canvas.loadFromJSON(jsonFile, () => {
                if (this._engineDestroyed()) {
                    callback && callback();
                    return;
                }
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
  // 引擎销毁检测：组件卸载/页面切换会 destroy 引擎（hooksEntity 清空），而 loadJSON
  // 是"加载背景图可达数秒"的异步管线，中途引擎被销毁时继续走 hook 会抛
  // "Cannot read properties of undefined (reading 'callAsync')"（确认应用切换弹窗视图即触发）。
  // 各异步边界检查此标记，静默放弃后续加载（callback 照常回执，调用方 Promise 正常收口）
    _engineDestroyed() {
        const hooks = this.editor && this.editor.hooksEntity;
        return !this.editor || this.editor.destroyed === true || !hooks || !hooks.hookTransform;
    }

    promiseCallAsync(item) {
        return new Promise((resolve) => {
            if (this._engineDestroyed()) return resolve(item);
            this.editor.hooksEntity.hookTransform.callAsync(item, () => {
                resolve(item);
            });
        });
    }
    getJson(complete = false) {
        // 保存/导出模板 JSON 前，强制退出变量预览，确保使用原始占位符
        const vp = this.editor.getPlugin('VariablePlugin');
        vp && vp.exitPreview && vp.exitPreview();
        const keys = this.getExtensionKey();
        const json = this.canvas.toJSON(keys);
        // 附加模板变量元数据（包裹符 + 变量声明），供前台用户端解析与渲染
        if (vp && vp.getVariableMeta) {
            json.variableMeta = vp.getVariableMeta();
        }
        // 移除分片缓存参数（与 loadJSON 的追加对称）：存储/导出态恢复干净 URL，
        // 完整导出与最小化导出统一处理，保证保存的 JSON 不携带请求态参数
        removeImagesCacheBustParam(json);
        // 完整导出（saveJson 下载 JSON 文件）：不精简易读，缩进/格式由调用方负责
        if (complete) {
            return json;
        }
        // 最小化导出（clipboard / 运营后台保存）：
        // 二维码/条形码不再保存 base64：仅保留 extension 参数，渲染时按参数动态生成
        this._stripGeneratedSrc(json);
        // 变量背景（tile 形态）：Pattern 仅是派生渲染结果，序列化用变量 URL 顶替占位 base64
        this._stripBackgroundPatternSource(json);
        // 剔除等于默认值的字段，缩小 JSON 体积（渲染端 loadJSON 对称补回）
        stripCanvasDefaults(json);
        // 资源去重：重复图片（相同 src）提升为顶层 assets 清单，以 assetId 引用
        if (this._useAssetManifest()) {
            this._applyAssetManifest(json);
        }
        // example 为编辑端测试值，仅在完整导出时保留；最小化导出排除（由导出管线控制）
        if (Array.isArray(json.variableMeta && json.variableMeta.variables)) {
            json.variableMeta.variables.forEach((v) => delete v.example);
        }
        return json;
    }
    // 是否启用资源清单去重（可通过 editor.options.useAssetManifest 开启）
    _useAssetManifest() {
        return !!(this.editor && this.editor.options && this.editor.options.useAssetManifest);
    }
    // 删除二维码/条形码对象中由生成函数产生的 base64 src（递归，含 group.objects）
    _stripGeneratedSrc(json) {
        const strip = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                if (item.extensionType === 'qrcode' || item.extensionType === 'barcode') {
                    delete item.src;
                }
                if (Array.isArray(item.objects)) strip(item.objects);
            });
        };
        if (json && Array.isArray(json.objects)) strip(json.objects);
        return json;
    }
    // 变量背景（tile 形态）：fill.source 由占位图 base64 顶替为变量 URL（obj.src），
    // 保证 JSON 无 base64，且渲染端 renderObjects 替换 src 后 pattern 源同步为真实 URL。
    // （编辑端导入时由 WorkspacePlugin.hookImportAfter 用占位图重建 pattern。）
    _stripBackgroundPatternSource(json) {
        const walk = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                if (
                    item.id === 'backgroundImage' &&
                    item.isVariableBackground === true &&
                    item.type === 'rect' &&
                    item.fill &&
                    typeof item.src === 'string'
                ) {
                    item.fill.source = item.src;
                }
                if (Array.isArray(item.objects)) walk(item.objects);
            });
        };
        if (json && Array.isArray(json.objects)) walk(json.objects);
        return json;
    }
    // 资源去重：把"重复出现 ≥2 次的相同图片 src"提升为顶层 assets 清单，
    // 对象改为 assetId 引用（不内联 src），供渲染器统一加载与缓存。
    // 唯一 src（只出现一次）保持内联，避免清单反而膨胀。
    _applyAssetManifest(json) {
        if (!json || !Array.isArray(json.objects)) return;
        // 变量 src（含占位符）不是静态资源，不参与去重（否则替换成 assetId 后变量丢失）
        const vp = this.editor.getPlugin && this.editor.getPlugin('VariablePlugin');
        const isVariableSrc = (src) =>
          !!(vp && vp.containsVariable && typeof src === 'string' && vp.containsVariable(src));
        const count = new Map();
        const walk = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                if (
                    item.type === 'image' &&
                    typeof item.src === 'string' &&
                    item.src &&
                    !isVariableSrc(item.src)
                ) {
                    count.set(item.src, (count.get(item.src) || 0) + 1);
                }
                if (Array.isArray(item.objects)) walk(item.objects);
            });
        };
        walk(json.objects);
        const assets = [];
        const idOf = new Map();
        let idx = 0;
        for (const [src, c] of count) {
            if (c >= 2) {
                const id = `asset_${idx++}`;
                assets.push({ id, url: src });
                idOf.set(src, id);
            }
        }
        if (!assets.length) return;
        json.assets = assets;
        const replace = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                if (
                    item.type === 'image' &&
                    typeof item.src === 'string' &&
                    !isVariableSrc(item.src)
                ) {
                    const id = idOf.get(item.src);
                    if (id) {
                        delete item.src;
                        item.assetId = id;
                    }
                }
                if (Array.isArray(item.objects)) replace(item.objects);
            });
        };
        replace(json.objects);
    }
    // 资源清单还原：assetId 引用 -> 内联 src（loadJSON 加载前调用）
    _expandAssetManifest(json) {
        if (!json || !Array.isArray(json.assets)) return;
        const map = new Map(json.assets.map((a) => [a && a.id, a && a.url]));
        const expand = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                if (item.assetId != null && typeof item.src !== 'string') {
                    const url = map.get(item.assetId);
                    if (typeof url === 'string') {
                        item.src = url;
                        // 还原为内联形式后清理引用标记，避免二次序列化残留
                        delete item.assetId;
                    }
                }
                if (Array.isArray(item.objects)) expand(item.objects);
            });
        };
        if (Array.isArray(json.objects)) expand(json.objects);
    }
    getExtensionKey() {
        return [
            'id',
            'gradientAngle',
            'selectable',
            'hasControls',
            // evented 必须序列化：workspace/背景图 evented:false 否则 undo/redo、
            // 加载恢复后回退为 fabric 默认 true，系统层会重新响应鼠标（表现为可被选中编辑）
            'evented',
            'editable',
            'extensionType',
            'extension',
            'verticalAlign',
            'roundValue',
            'backgroundImageMode',
            'backgroundPosition',
            'isVariableImage',
            'isVariableBackground',
            // 背景图统一以 src 为唯一事实来源（tile 形态是 rect，fabric.Rect 不内置序列化 src）
            'src',
            'follow',
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
        // 与 getJson 保持一致：二维码/条形码不携带生成的 base64，缺省字段一并精简
        this._stripGeneratedSrc(json);
        stripDefaultFields(json);
        return clipboardText(JSON.stringify(json)).then(() => true);
    }
    async saveJson() {
        // 下载 JSON 文件：完整导出（不精简、保留 example），缩进 2 空格
        const dataUrl = this.getJson(true);
        // 把文本text转为textgroup，让导入可以编辑
        await transformText(dataUrl.objects);
        const fileStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataUrl, null, 2))}`;
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
    saveImg(multiplier = 1) {
        this.editor.hooksEntity.hookSaveBefore.callAsync('', () => {
            const option = this._getSaveOption(multiplier);
            this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
            const dataUrl = this.canvas.toDataURL(option);
            this.editor.hooksEntity.hookSaveAfter.callAsync(dataUrl, () => {
                downFile(dataUrl, 'png');
            });
        });
    }
    preview(multiplier = 1) {
        return new Promise((resolve) => {
            this.editor.hooksEntity.hookSaveBefore.callAsync('', () => {
                const option = this._getSaveOption(multiplier);
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
    _getSaveOption(multiplier = 1) {
        const workspace = this.canvas
            .getObjects()
            .find((item) => item.id === 'workspace');
        console.log('getObjects', this.canvas.getObjects());
        const { left, top, width, height } = workspace;
        const option = {
            name: 'New Image',
            format: 'png',
            quality: 1,
            multiplier,
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
