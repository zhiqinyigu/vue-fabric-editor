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
