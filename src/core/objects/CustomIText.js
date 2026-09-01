/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:22
 * 路径文本序列化补丁（编辑器与渲染器共用）：
 * fabric.IText.fromObject 不重建 path（恢复为普通对象），且 editable 丢失。
 * 这里补上：有 path 时重建 fabric.Path，恢复 editable。
 */
import { fabric } from 'fabric';

/*
 * fabric 5.5.0（#10355）把路径文字的 initDimensions 尺寸从 path 尺寸改为
 * path 尺寸 + 1.1 倍行高（让包围盒容纳超出路径的文字）。origin 为 left/top 时
 * 对象中心偏移增量的一半，路径渲染整体偏移，存量数据与替换路径
 * "text.left/top = path.left/top" 的对齐基准失效。
 * 按对象属性 legacyPathDims 切换语义（属性面板可切换，序列化随 JSON 保存）：
 * - true / 未设置（默认）：回退为 5.3.0 尺寸语义，兼容存量模板（项目视觉基线）
 * - false：保持 5.5.0 原生尺寸语义，用于粘贴自其他基于 5.5+ 编辑器的路径文字
 * 仅影响尺寸，5.4.x 的其他修复不受影响。
 */
const originalTextInitDimensions = fabric.Text.prototype.initDimensions;
fabric.Text.prototype.initDimensions = function () {
  originalTextInitDimensions.call(this);
  if (this.path && this.legacyPathDims !== false) {
    this.width = this.path.width;
    this.height = this.path.height;
  }
};

/**
 * 按对象当前的 legacyPathDims 语义重算尺寸，并保持路径渲染位置（对象中心）不变。
 * 用于属性面板切换开关：尺寸语义变化会改变对象中心，按 origin 反向补偿 left/top。
 * @param {fabric.Text} textObj 含 path 的文本对象
 * @returns {fabric.Text} textObj
 */
export function refreshPathTextDims(textObj) {
  if (!textObj || !textObj.path) return textObj;
  const wOld = textObj.width;
  const hOld = textObj.height;
  textObj.initDimensions();
  const dW = (textObj.width - wOld) / 2;
  const dH = (textObj.height - hOld) / 2;
  if (dW || dH) {
    const patch = {};
    // origin 为 center 时中心不随宽高变化，无需补偿
    if (dW && textObj.originX === 'left') patch.left = textObj.left - dW;
    else if (dW && textObj.originX === 'right') patch.left = textObj.left + dW;
    if (dH && textObj.originY === 'top') patch.top = textObj.top - dH;
    else if (dH && textObj.originY === 'bottom') patch.top = textObj.top + dH;
    if (patch.left != null || patch.top != null) textObj.set(patch);
  }
  textObj.setCoords && textObj.setCoords();
  return textObj;
}

const originalITextFromObject = fabric.IText.fromObject;
fabric.IText.fromObject = function (object, callback) {
  const path = object && object.path;
  const editable = object && object.editable;
  if (!path || !path.path) {
    // 无路径：仅恢复 editable（兼容普通 i-text）
    if (typeof editable === 'boolean') {
      const origCb = callback;
      callback = (instance) => {
        instance.editable = editable;
        origCb && origCb(instance);
      };
    }
    return originalITextFromObject.call(this, object, callback);
  }
  const objCopy = Object.assign({}, object);
  delete objCopy.path;
  delete objCopy.editable;
  return originalITextFromObject.call(this, objCopy, (textInstance) => {
    const pathInstance = new fabric.Path(path.path, {
      fill: path.fill || null,
      stroke: path.stroke,
      strokeWidth: path.strokeWidth,
      selectable: false,
      evented: false,
    });
    textInstance.set('path', pathInstance);
    textInstance.editable = typeof editable === 'boolean' ? editable : true;
    textInstance.initDimensions();
    textInstance.setCoords && textInstance.setCoords();
    callback && callback(textInstance);
  });
};

export default fabric.IText;
