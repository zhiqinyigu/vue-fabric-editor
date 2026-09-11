/*
 * @Author: 秦少卫
 * @Date: 2024-04-21 23:51:01
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-06-07 21:53:36
 * @Description: 自定义字体
 */
import FontFaceObserver from 'fontfaceobserver';
import { fabric } from 'fabric';
import { downFile } from '../utils/utils';
class FontPlugin {
  constructor(canvas, editor, config) {
    this.canvas = canvas;
    this.editor = editor;
    // 字体数据提供者：由业务注入（返回 [{ name, file, img, type }]）
    this.getFonts = config.getFonts || (() => Promise.resolve([]));
    this.cacheList = [];
    this.tempPromise = null;
  }
  hookImportBefore(json) {
    return this.downFontByJSON(json);
  }
  getFontList() {
    // 返回暂存字体
    if (this.cacheList.length) {
      return Promise.resolve(this.cacheList);
    }
    if (this.tempPromise) return this.tempPromise;
    this.tempPromise = this.getFonts()
      .then((list) => {
        const safe = (Array.isArray(list) ? list : []).map((item) => ({
          name: item.name,
          type: item.type,
          file: item.file || '',
          img: item.img || '',
        }));
        this.cacheList = safe;
        this.createFontCSS(safe);
        return safe;
      })
      .catch(() => {
        // 数据提供异常时降级为空列表，避免未处理 rejection 影响编辑器初始化
        this.cacheList = [];
        return this.cacheList;
      });
    return this.tempPromise;
  }
  downFontByJSON(str) {
    let object;
    try {
      object = JSON.parse(str);
    } catch (e) {
      // 非 JSON（空串/截断数据）直接跳过字体加载
      return Promise.resolve();
    }
    let fontFamilies = [];
    const skipFonts = ['arial'];
    if (object.objects) {
      // 画布 JSON：仅收集有 fontFamily 的文本对象，避免 item.type/fontFamily 为空时抛错
      fontFamilies = object.objects
        .filter((item) => {
          const hasFontFile = this.cacheList.find(
            (font) => font.name === item.fontFamily && font.file
          );
          return (
            item.type &&
            item.type.includes('text') &&
            item.fontFamily &&
            !skipFonts.includes(item.fontFamily) &&
            hasFontFile
          );
        })
        .map((item) => item.fontFamily);
    } else if (object.fontFamily && !skipFonts.includes(object.fontFamily)) {
      // 单个对象 JSON（如 font.json）：仅当存在字体名时才加载
      fontFamilies = [object.fontFamily];
    }
    const fontFamiliesAll = fontFamilies.map((fontName) => {
      const font = new FontFaceObserver(fontName);
      return font.load(null, 150000);
    });
    return Promise.all(fontFamiliesAll).then(() => {
      // 字体加载完成后：回退字体测量值已失效，清除字符宽缓存并重测所有文本
      this._remeasureTexts();
      return;
    });
  }
  // 清除 fabric 字符宽度缓存并对所有 textbox 重排/重测（自定义字体替换回退字体的测量差异）
  _remeasureTexts() {
    fabric.charWidthsCache = {};
    this.canvas.getObjects().forEach((obj) => {
      if (obj.type === 'textbox' && obj.initDimensions) {
        obj.initDimensions();
        obj.setCoords && obj.setCoords();
      }
    });
    this.canvas.requestRenderAll && this.canvas.requestRenderAll();
  }
  // 获取字体数据 新增字体样式使用
  getFontJson() {
    const activeObject = this.canvas.getActiveObject();
    if (activeObject) {
      const json = activeObject.toJSON(['id', 'gradientAngle', 'selectable', 'hasControls']);
      const fileStr = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(json, null, '\t')
      )}`;
      const dataUrl = activeObject.toDataURL({});
      downFile(fileStr, 'font.json');
      downFile(dataUrl, 'font.png');
    }
  }
  loadFont(fontName) {
    const font = new FontFaceObserver(fontName);
    return font.load(null, 150000).then(() => {
      const activeObject = this.canvas.getActiveObjects()[0];
      if (activeObject) {
        activeObject.set('fontFamily', fontName);
      }
      // 字体加载完成后对所有 textbox 重排/重测（清除回退字体的测量缓存）
      this._remeasureTexts();
    });
  }
  createFontCSS(arr) {
    let code = '';
    arr.forEach((item) => {
      if (!item.file) return;
      code =
        code +
        `
    @font-face {
      font-family: ${item.name};
      src: url('${item.file}');
    }
    `;
    });
    const style = document.createElement('style');
    try {
      style.appendChild(document.createTextNode(code));
    } catch (error) {
      // style.styleSheet.cssText = code;
    }
    const head = document.getElementsByTagName('head')[0];
    head.appendChild(style);
  }
  destroy() {
    console.log('pluginDestroy');
  }
}
FontPlugin.pluginName = 'FontPlugin';
FontPlugin.apis = ['getFontList', 'loadFont', 'getFontJson', 'downFontByJSON'];
export default FontPlugin;
