/*
 * @Author: 秦少卫
 * @Date: 2023-06-20 12:38:37
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-07 11:25:05
 * @Description: 复制插件
 */
import { fabric } from 'fabric';
import { v4 as uuid } from 'uuid';
import { getImgStr } from '../utils/utils';
// 画布内元素复制专用 MIME：copy 事件随 text/plain 一并写入对象快照，
// 外部应用会忽略该类型（剪贴板可见内容为纯文字），粘贴事件可读回用于还原对象
export const VFE_COPY_MIME = 'application/x-vfe-copy';
class CopyPlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this.hotkeys = ['ctrl+v', 'ctrl+c'];
        this.cache = null;
        // 复制哨兵：copy 时记录写入 text/plain 的纯文字，paste 时比对识别画布内复制
        this.lastCopyText = null;
        // 页面内输入框/编辑态发生的复制（原生文本复制），使哨兵失效避免误判
        this._externalCopy = false;
        // 本次 ctrl+v 粘贴是否已由 pasteListener 处理（防止 setTimeout 兜底二次克隆）
        this._pasteHandled = false;
        this._onPaste = (e) => this.pasteListener(e);
        this._onCopy = (e) => this.copyListener(e);
        this.initPaste();
        this.initCopy();
    }
    // 多选对象复制
    _copyActiveSelection(activeObject) {
        // 间距设置
        const grid = 10;
        const canvas = this.canvas;
        const keys = this.editor.getExtensionKey();
        activeObject === null || activeObject === void 0 ? void 0 : activeObject.clone((cloned) => {
            // 再次进行克隆，处理选择多个对象的情况
            cloned.clone((clonedObj) => {
                canvas.discardActiveObject();
                if (clonedObj.left === undefined || clonedObj.top === undefined)
                    return;
                // 将克隆的画布重新赋值
                clonedObj.canvas = canvas;
                // 设置位置信息
                clonedObj.set({
                    left: clonedObj.left + grid,
                    top: clonedObj.top + grid,
                    evented: true,
                    id: uuid(),
                });
                clonedObj.forEachObject((obj) => {
                    obj.id = uuid();
                    canvas.add(obj);
                });
                // 解决不可选择问题
                clonedObj.setCoords();
                canvas.setActiveObject(clonedObj);
                canvas.requestRenderAll();
            });
        }, keys);
    }
    // 单个对象复制
    _copyObject(activeObject) {
        // 间距设置
        const grid = 10;
        const canvas = this.canvas;
        const keys = this.editor.getExtensionKey();
        activeObject === null || activeObject === void 0 ? void 0 : activeObject.clone((cloned) => {
            if (cloned.left === undefined || cloned.top === undefined)
                return;
            canvas.discardActiveObject();
            // 设置位置信息
            cloned.set({
                left: cloned.left + grid,
                top: cloned.top + grid,
                evented: true,
                id: uuid(),
            });
            canvas.add(cloned);
            canvas.setActiveObject(cloned);
            canvas.requestRenderAll();
        }, keys);
    }
    // 复制元素
    clone(paramsActiveObeject) {
        const activeObject = paramsActiveObeject || this.canvas.getActiveObject();
        if (!activeObject)
            return;
        if ((activeObject === null || activeObject === void 0 ? void 0 : activeObject.type) === 'activeSelection') {
            this._copyActiveSelection(activeObject);
        }
        else {
            this._copyObject(activeObject);
        }
    }
    // 快捷键扩展回调
    hotkeyEvent(eventName, e) {
        if (eventName === 'ctrl+c' && e.type === 'keydown') {
            // cache 兜底：部分浏览器（如 Safari 无选区）不派发 copy 事件时仍可克隆
            // 剪贴板内容由 copyListener 写入（纯文字 + 对象快照）
            this.cache = this.canvas.getActiveObject();
        }
        if (eventName === 'ctrl+v' && e.type === 'keydown') {
            this._pasteHandled = false;
            // 确保clone元素操作的执行晚于pasteListener
            setTimeout(() => {
                if (!this._pasteHandled && this.cache) {
                    this.clone(this.cache);
                }
                this._pasteHandled = false;
            }, 0);
        }
    }
    contextMenu() {
        const activeObject = this.canvas.getActiveObject();
        if (activeObject) {
            return [{ text: '复制', hotkey: 'Ctrl+V', disabled: false, onclick: () => this.clone() }];
        }
    }
    destroy() {
        window.removeEventListener('paste', this._onPaste);
        document.removeEventListener('copy', this._onCopy);
    }
    initPaste() {
        window.addEventListener('paste', this._onPaste);
    }
    initCopy() {
        // ctrl+c 时浏览器派发原生 copy 事件（Chrome/Edge/Firefox 无选区也会派发），
        // 在此写入剪贴板：text/plain 为元素纯文字（外部应用可见），自定义 MIME 为对象快照
        document.addEventListener('copy', this._onCopy);
    }
    // 提取复制到剪贴板的可见纯文字：文本元素取内容，多选取子元素文字拼接，其它类型为空
    _getCopyPureText(activeObject) {
        if (activeObject.type === 'activeSelection') {
        return (activeObject.getObjects ? activeObject.getObjects() : activeObject._objects || [])
            .map((obj) => (obj && typeof obj.text === 'string' ? obj.text : ''))
            .filter(Boolean)
            .join('\n');
        }
        return typeof activeObject.text === 'string' ? activeObject.text : '';
    }
    copyListener(e) {
        const activeEl = document.activeElement;
        if (activeEl !== document.body) {
            // 编辑态/输入框内的复制：不干预，保留原生文本复制，并使哨兵失效避免误判
            if (
                activeEl &&
                (activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                activeEl.isContentEditable)
            ) {
                this._externalCopy = true;
            }
            return;
        }
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject) return;
        const keys = this.editor.getExtensionKey();
        const pureText = this._getCopyPureText(activeObject);
        e.clipboardData.setData('text/plain', pureText);
        e.clipboardData.setData(VFE_COPY_MIME, JSON.stringify(activeObject.toObject(keys)));
        e.preventDefault();
        this.cache = activeObject;
        this.lastCopyText = pureText;
        this._externalCopy = false;
    }
    async pasteListener(event) {
        const canvas = this.canvas;
        if (document.activeElement === document.body) {
            event.preventDefault(); // 阻止默认粘贴行为
        }
        else {
            return;
        }
        const clipboardData = event.clipboardData || event.originalEvent.clipboardData;
        // 1) 自定义 MIME（Chrome/Edge/Firefox）：按复制时快照还原对象克隆
        const payloadText = clipboardData.getData(VFE_COPY_MIME);
        if (payloadText) {
        this.cache = null; // 交由下方克隆，避免 setTimeout 二次克隆
        this._pasteHandled = true;
        try {
            const payload = JSON.parse(payloadText);
            fabric.util.enlivenObjects([payload], (objs) => {
                objs[0] && this.clone(objs[0]);
            });
        } catch (err) {
            /* payload 损坏，忽略 */
        }
            return;
        }
        // 2) 哨兵比对（Safari 等丢弃自定义 MIME 的浏览器）：text/plain 与复制时写入的
        //    纯文字完全一致才认定画布内复制；直接克隆并保留 cache 支持连续粘贴
        const rawText = clipboardData.getData('text/plain');
        if (!this._externalCopy && this.cache && rawText === this.lastCopyText) {
            this._pasteHandled = true;
            this.clone(this.cache);
            return;
        }
        const items = clipboardData.items;
        const fileAccept = '.pdf,.psd,.cdr,.ai,.svg,.jpg,.jpeg,.png,.webp,.json';
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                const curFileSuffix = file.name.split('.').pop();
                if (!fileAccept.split(',').includes(`.${curFileSuffix}`))
                    return;
                if (curFileSuffix === 'svg') {
                    const svgFile = await getImgStr(file);
                    if (!svgFile)
                        throw new Error('file is undefined');
                    fabric.loadSVGFromURL(svgFile, (objects, options) => {
                        const item = fabric.util.groupSVGElements(objects, {
                            ...options,
                            name: 'defaultSVG',
                            id: uuid(),
                        });
                        canvas.add(item).centerObject(item).renderAll();
                    });
                }
                // if (curFileSuffix === 'json') {
                //   const dataText = await getImageText(file);
                //   const template = JSON.parse(dataText);
                //   addTemplate(template);
                // }
                if (item.type.indexOf('image/') === 0) {
                    // 这是一个图片文件
                    const imageUrl = URL.createObjectURL(file);
                    const imgEl = document.createElement('img');
                    imgEl.src = imageUrl;
                    // 插入页面
                    document.body.appendChild(imgEl);
                    imgEl.onload = () => {
                        // 创建图片对象
                        const imgInstance = new fabric.Image(imgEl, {
                            id: uuid(),
                            name: '图片1',
                            left: 100,
                            top: 100,
                        });
                        // 设置缩放
                        canvas.add(imgInstance);
                        canvas.setActiveObject(imgInstance);
                        canvas.renderAll();
                        // 删除页面中的图片元素
                        imgEl.remove();
                    };
                }
            }
            else if (item.kind === 'string' && item.type.indexOf('text/plain') === 0) {
                // 文本数据
                item.getAsString((text) => {
                    // 插入到文本框
                    const activeObject = canvas.getActiveObject();
                    // 如果是激活的文字把复制的内容插入到对应光标位置
                    if (activeObject &&
                        (activeObject.type === 'textbox' || activeObject.type === 'i-text') &&
                        activeObject.text) {
                        const cursorPosition = activeObject.selectionStart;
                        // 用 fabric 的 insertChars 插入：内部同步样式复制、清理越界样式并重算尺寸
                        activeObject.insertChars(text, null, cursorPosition, cursorPosition);
                        // 重新设置光标的位置
                        activeObject.selectionStart = cursorPosition + text.length;
                        activeObject.selectionEnd = cursorPosition + text.length;
                        // 重新渲染画布展示更新后的文本
                        activeObject.dirty = true;
                        canvas.renderAll();
                    }
                    else {
                        const fabricText = new fabric.IText(text, {
                            left: 100,
                            top: 100,
                            fontSize: 80,
                            id: uuid(),
                        });
                        canvas.add(fabricText);
                        canvas.setActiveObject(fabricText);
                    }
                });
            }
        }
        // 复制浏览器外的元素时，清空暂存的画布内粘贴元素
        if (items.length)
            this.cache = null;
    }
}
CopyPlugin.pluginName = 'CopyPlugin';
CopyPlugin.apis = ['clone'];
export default CopyPlugin;
