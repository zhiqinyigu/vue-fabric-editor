/*
 * @Author: 秦少卫
 * @Date: 2024-06-06 14:12:24
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-07 21:24:56
 * @Description: 条形码生成工具
 */
import { fabric } from 'fabric';
import { generateBarcodeDataURL } from '../generators';
// 条形码生成参数
// https://github.com/lindell/JsBarcode/wiki/Options
var CodeType;
(function (CodeType) {
    CodeType["CODE128"] = "CODE128";
    CodeType["EAN8"] = "EAN8";
    CodeType["EAN13"] = "EAN13";
    CodeType["ITF14"] = "ITF14";
    CodeType["codabar"] = "codabar";
    CodeType["pharmacode"] = "pharmacode";
})(CodeType || (CodeType = {}));
class BarCodePlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
    }
    async hookTransform(object) {
        if (object.extensionType === 'barcode') {
            // 无参数（或旧数据仅有 src）时保留现有 src，避免渲染失败
            if (!object.extension || object.extension.value == null) return;
            const url = await this._getBase64Str(object.extension);
            object.src = url;
        }
    }
    _getBase64Str(option) {
        return generateBarcodeDataURL(option);
    }
    _defaultBarcodeOption() {
        return {
            value: '123456',
            format: CodeType.CODE128,
            text: 'sample text',
            textAlign: 'left',
            textPosition: 'bottom',
            fontSize: 12,
            background: '#fff',
            lineColor: '#000',
            displayValue: false,
        };
    }
    addBarcode() {
        const option = this._defaultBarcodeOption();
        const url = this._getBase64Str(JSON.parse(JSON.stringify(option)));
        fabric.Image.fromURL(url, (imgEl) => {
            imgEl.set({
                extensionType: 'barcode',
                extension: option,
            });
            imgEl.scaleToWidth(this.editor.getWorkspase().getScaledWidth() / 2);
            this.canvas.add(imgEl);
            this.canvas.setActiveObject(imgEl);
            this.editor.position('center');
            this.canvas.renderAll();
            this.editor.saveState();
        }, { crossOrigin: 'anonymous' });
    }
    setBarcode(option) {
        try {
            const url = this._getBase64Str(option);
            const activeObject = this.canvas.getActiveObjects()[0];
            fabric.Image.fromURL(url, (imgEl) => {
                imgEl.set({
                    left: activeObject.left,
                    top: activeObject.top,
                    extensionType: 'barcode',
                    extension: { ...option },
                });
                imgEl.scaleToWidth(activeObject.getScaledWidth());
                this.editor.del();
                this.canvas.add(imgEl);
                this.canvas.setActiveObject(imgEl);
            }, { crossOrigin: 'anonymous' });
        }
        catch (error) {
            console.log(error);
        }
    }
    getBarcodeTypes() {
        return Object.values(CodeType);
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
BarCodePlugin.pluginName = 'BarCodePlugin';
BarCodePlugin.apis = ['addBarcode', 'setBarcode', 'getBarcodeTypes'];
export default BarCodePlugin;
