/*
 * @Author: 秦少卫
 * @Date: 2024-06-06 19:58:26
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-22 10:26:59
 * @Description: 二维码生成工具
 */
import { fabric } from 'fabric';
import QRCodeStyling from 'qr-code-styling';
import { blobToBase64 } from '../utils/utils';
// 二维码生成参数
var DotsType;
(function (DotsType) {
    DotsType["rounded"] = "rounded";
    DotsType["dots"] = "dots";
    DotsType["classy"] = "classy";
    DotsType["classy_rounded"] = "classy-rounded";
    DotsType["square"] = "square";
    DotsType["extra_rounded"] = "extra-rounded";
})(DotsType || (DotsType = {}));
var CornersType;
(function (CornersType) {
    CornersType["dot"] = "dot";
    CornersType["square"] = "square";
    CornersType["extra_rounded"] = "extra-rounded";
})(CornersType || (CornersType = {}));
var cornersDotType;
(function (cornersDotType) {
    cornersDotType["dot"] = "dot";
    cornersDotType["square"] = "square";
})(cornersDotType || (cornersDotType = {}));
var errorCorrectionLevelType;
(function (errorCorrectionLevelType) {
    errorCorrectionLevelType["L"] = "L";
    errorCorrectionLevelType["M"] = "M";
    errorCorrectionLevelType["Q"] = "Q";
    errorCorrectionLevelType["H"] = "H";
})(errorCorrectionLevelType || (errorCorrectionLevelType = {}));
class QrCodePlugin {
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
    }
    async hookTransform(object) {
        if (object.extensionType === 'qrcode') {
            const paramsOption = this._paramsToOption(object.extension);
            const url = await this._getBase64Str(paramsOption);
            object.src = url;
        }
    }
    async _getBase64Str(options) {
        const qrCode = new QRCodeStyling(options);
        const blob = await qrCode.getRawData('png');
        if (!blob)
            return '';
        const base64Str = (await blobToBase64(blob));
        return base64Str || '';
    }
    _defaultBarcodeOption() {
        return {
            data: 'https://kuaitu.cc',
            width: 300,
            margin: 10,
            errorCorrectionLevel: 'M',
            dotsColor: '#000000',
            dotsType: 'rounded',
            cornersSquareColor: '#000000',
            cornersSquareType: 'square',
            cornersDotColor: '#000000',
            cornersDotType: 'square',
            background: '#ffffff',
        };
    }
    _paramsToOption(option) {
        return {
            width: option.width,
            height: option.width,
            type: 'canvas',
            data: option.data,
            margin: option.margin,
            qrOptions: {
                errorCorrectionLevel: option.errorCorrectionLevel,
            },
            // 点
            dotsOptions: {
                color: option.dotsColor,
                type: option.dotsType,
            },
            // 三个角
            cornersSquareOptions: {
                color: option.cornersSquareColor,
                type: option.cornersSquareType,
            },
            // 圆点选项
            cornersDotOptions: {
                color: option.cornersDotColor,
                type: option.cornersDotType,
            },
            // 背景
            backgroundOptions: {
                color: option.background,
            },
        };
    }
    async addQrCode() {
        const option = this._defaultBarcodeOption();
        const paramsOption = this._paramsToOption(option);
        const url = await this._getBase64Str(paramsOption);
        fabric.Image.fromURL(url, (imgEl) => {
            imgEl.set({
                extensionType: 'qrcode',
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
    async setQrCode(option) {
        try {
            const paramsOption = this._paramsToOption(option);
            const url = await this._getBase64Str(paramsOption);
            const activeObject = this.canvas.getActiveObjects()[0];
            fabric.Image.fromURL(url, (imgEl) => {
                imgEl.set({
                    left: activeObject.left,
                    top: activeObject.top,
                    extensionType: 'qrcode',
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
    getQrCodeTypes() {
        return {
            DotsType: Object.values(DotsType),
            CornersType: Object.values(CornersType),
            cornersDotType: Object.values(cornersDotType),
            errorCorrectionLevelType: Object.values(errorCorrectionLevelType),
        };
    }
    destroy() {
        console.log('pluginDestroy');
    }
}
QrCodePlugin.pluginName = 'QrCodePlugin';
QrCodePlugin.apis = ['addQrCode', 'setQrCode', 'getQrCodeTypes'];
export default QrCodePlugin;
