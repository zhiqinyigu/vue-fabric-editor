/*
 * @Author: 秦少卫
 * @Date: 2024-07-06 12:34:00
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-06 17:11:03
 * @Description: 基础元素类型添加
 */
import { fabric } from 'fabric';
import { v4 as uuid } from 'uuid';
class AddBaseTypePlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        this.editor = editor;
        this.canvas = canvas;
    }
    addBaseType(item, optons) {
        const { event = false, center = true } = optons || {};
        item.set({
            id: uuid(),
        });
        // 超出画布80%时等比缩小，否则保持原始尺寸
        this._fitOverflow(item);
        event && this._toEvent(item, event);
        this.canvas.add(item);
        if (!event && center) {
            this._toCenter(item);
        }
        this.canvas.setActiveObject(item);
        this.canvas.renderAll();
        this.editor.saveState();
    }
    _toEvent(item, event) {
        const { left, top } = this.canvas.getSelectionElement().getBoundingClientRect();
        if (event.x < left || event.y < top || item.width === undefined)
            return;
        const point = {
            x: event.x - left,
            y: event.y - top,
        };
        const pointerVpt = this.canvas.restorePointerVpt(point);
        item.set({
            left: pointerVpt.x,
            top: pointerVpt.y,
        });
    }
    _toCenter(item) {
        this.canvas.setActiveObject(item);
        this.editor.position('center');
    }
    // 超出画布80%时等比缩小（默认保持原始尺寸）
    _fitOverflow(item) {
        if (item.width === undefined || item.height === undefined) {
            return;
        }
        const workspace = this.editor.getWorkspase();
        if (!workspace) {
            return;
        }
        const maxWidth = workspace.getScaledWidth() * 0.8;
        const maxHeight = workspace.getScaledHeight() * 0.8;
        const ratio = Math.min(maxWidth / item.getScaledWidth(), maxHeight / item.getScaledHeight());
        if (ratio < 1) {
            item.scaleX *= ratio;
            item.scaleY *= ratio;
        }
    }
    createImgByElement(target) {
        return new Promise((resolve, reject) => {
            const imgType = this.getImageExtension(target.src);
            if (imgType === 'svg') {
                fabric.loadSVGFromURL(target.src, (objects) => {
                    if (!objects || objects.length === 0) {
                        reject(new Error('SVG 图片加载失败，请检查地址与跨域(CORS)设置'));
                        return;
                    }
                    const item = fabric.util.groupSVGElements(objects, {
                        shadow: '',
                        fontFamily: 'arial',
                        name: 'svg元素',
                    });
                    resolve(item);
                });
            }
            else {
                fabric.Image.fromURL(target.src, (imgEl, isError) => {
                    if (isError) {
                        reject(new Error('图片加载失败，请检查地址与跨域(CORS)设置'));
                        return;
                    }
                    resolve(imgEl);
                }, { crossOrigin: 'anonymous' });
            }
        });
    }
    getImageExtension(imageUrl) {
        // 去除查询参数与 hash，兼容带参数的在线图片地址，避免扩展名误判
        const cleanUrl = (imageUrl || '').split('?')[0].split('#')[0];
        const pathParts = cleanUrl.split('/');
        const filename = pathParts[pathParts.length - 1];
        const fileParts = filename.split('.');
        // 仅当确实存在扩展名时才返回，否则视为无扩展名（如 data URL、纯路径地址）
        if (fileParts.length > 1) {
            return fileParts[fileParts.length - 1].toLowerCase();
        }
        return '';
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
AddBaseTypePlugin.pluginName = 'AddBaseTypePlugin';
AddBaseTypePlugin.apis = ['addBaseType', 'createImgByElement'];
export default AddBaseTypePlugin;
