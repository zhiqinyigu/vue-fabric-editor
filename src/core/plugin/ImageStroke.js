/*
 * @Author: June 1601745371@qq.com
 * @Date: 2024-06-19 10:30:25
 * @LastEditors: June 1601745371@qq.com
 * @LastEditTime: 2024-06-19 11:48:12
 * @Description: 图像描边
 */
class ImageStrokePlugin {
    //   public options: Required<IStrokeOps>;
    constructor(canvas, editor) {
        this.canvas = canvas;
        this.editor = editor;
        // this.options = Object.assign(
        //   {
        //     enabled: false,
        //     width: 5,
        //     color: '#000',
        //     type: 'source-over',
        //   },
        //   _options
        // );
    }
    addImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject();
            img.src = src;
        });
    }
    //   imageStrokeEnable() {
    //     this.options.enabled = true;
    //   }
    //   imageStrokeDisable() {
    //     this.options.enabled = false;
    //   }
    //   imageStrokeSet(key: 'enabled' | 'width' | 'color' | 'type', val: any) {
    //     this.options[key] = val;
    //   }
    async imageStrokeDraw(stroke, strokeWidth, type = 'source-over') {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject)
            return;
        const w = activeObject.originWidth || 0, h = activeObject.originHeight || 0, src = (activeObject === null || activeObject === void 0 ? void 0 : activeObject.originSrc) || activeObject.getSrc();
        let canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        // 描边等于0 说明关闭了开关或者不需要描边  直接从原图绘制
        if (strokeWidth === 0) {
            const { scaleX, scaleY, width, height } = activeObject;
            activeObject.setSrc(src, () => {
                var _a;
                activeObject.set('scaleX', (width * scaleX) / (activeObject.width || 1));
                activeObject.set('scaleY', (height * scaleY) / (activeObject.height || 1));
                (_a = activeObject.canvas) === null || _a === void 0 ? void 0 : _a.renderAll();
            });
            return;
        }
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        canvas.width = w + strokeWidth * 2;
        canvas.height = h + strokeWidth * 2;
        const dArr = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];
        const img = await this.addImage(src);
        if (!img)
            return;
        for (let i = 0; i < dArr.length; i += 2) {
            ctx.drawImage(img, strokeWidth + dArr[i] * strokeWidth, strokeWidth + dArr[i + 1] * strokeWidth, w, h);
        }
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = stroke;
        ctx.fillRect(0, 0, w + strokeWidth * 2, h + strokeWidth * 2);
        ctx.globalCompositeOperation = type;
        ctx.drawImage(img, strokeWidth, strokeWidth, w, h);
        const res = canvas === null || canvas === void 0 ? void 0 : canvas.toDataURL();
        canvas = null;
        if (!res)
            return;
        const { scaleX, scaleY, width, height } = activeObject;
        activeObject.setSrc(res, () => {
            var _a;
            activeObject.set('scaleX', (width * scaleX) / (activeObject.width || 1));
            activeObject.set('scaleY', (height * scaleY) / (activeObject.height || 1));
            (_a = activeObject.canvas) === null || _a === void 0 ? void 0 : _a.renderAll();
        });
    }
    destroy() {
        // this.editor.off('sizeChange', this.drawWaterMark);
    }
}
ImageStrokePlugin.pluginName = 'ImageStroke';
ImageStrokePlugin.apis = ['imageStrokeDraw'];
export default ImageStrokePlugin;
