/*
 * @Author: 秦少卫
 * @Date: 2022-09-05 22:21:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-22 10:24:53
 * @Description: 工具文件
 */
import { v4 as uuid } from 'uuid';
import { fabric } from 'fabric';
/**
 * @description: 图片文件转字符串
 * @param {Blob|File} file 文件
 * @return {Promise<String>}
 */
export function getImgStr(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result);
    });
    reader.readAsDataURL(file);
  });
}
/**
 * @description: 选择文件
 * @param {Object} options accept = '', capture = '', multiple = false
 * @return {Promise<FileList|null>}
 */
export function selectFiles(options) {
  return new Promise((resolve) => {
    const inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = (options && options.accept) || '';
    inputEl.multiple = !!(options && options.multiple);
    if (options && options.capture) {
      inputEl.capture = options.capture;
    }
    inputEl.onchange = () => {
      resolve(inputEl.files);
      inputEl.remove();
    };
    inputEl.click();
  });
}
/**
 * @description: 创建图片元素
 * @param {String} str 图片地址或者base64图片
 * @return {Promise} element 图片元素
 */
export function insertImgFile(str) {
  return new Promise((resolve) => {
    const imgEl = document.createElement('img');
    imgEl.src = str;
    // 插入页面
    document.body.appendChild(imgEl);
    imgEl.onload = () => {
      resolve(imgEl);
    };
  });
}
/**
 * Copying text to the clipboard
 * @param source Copy source
 * @returns Promise that resolves when the text is copied successfully, or rejects when the copy fails.
 */
export const clipboardText = (source) => {
  return new Promise((resolve, reject) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(source).then(resolve).catch(reject);
      return;
    }
    try {
      const textareaEl = document.createElement('textarea');
      textareaEl.value = source;
      textareaEl.style.position = 'fixed';
      textareaEl.style.opacity = '0';
      document.body.appendChild(textareaEl);
      textareaEl.select();
      const ok = document.execCommand('copy');
      textareaEl.remove();
      if (ok) {
        resolve();
      } else {
        reject(new Error('copy failed'));
      }
    } catch (e) {
      reject(e);
    }
  });
};
export function downFile(fileStr, fileType) {
  const anchorEl = document.createElement('a');
  anchorEl.href = fileStr;
  anchorEl.download = `${uuid()}.${fileType}`;
  document.body.appendChild(anchorEl); // required for firefox
  anchorEl.click();
  anchorEl.remove();
}
export function drawImg(ctx, left, top, img, wSize, hSize, angle) {
  if (angle === undefined) return;
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(angle);
  ctx.drawImage(img, -wSize / 2, -hSize / 2, wSize, hSize);
  ctx.restore();
}
export function shiftAngle(start, end) {
  const startX = start.x;
  const startY = start.y;
  const x2 = end.x - startX;
  const y2 = end.y - startY;
  const r = Math.sqrt(x2 * x2 + y2 * y2);
  let angle = (Math.atan2(y2, x2) / Math.PI) * 180;
  angle = ~~(((angle + 7.5) % 360) / 15) * 15;
  const cosx = r * Math.cos((angle * Math.PI) / 180);
  const sinx = r * Math.sin((angle * Math.PI) / 180);
  return {
    x: cosx + startX,
    y: sinx + startY,
  };
}
/**
 * 类型工具
 */
export const isImage = (thing) => {
  return thing instanceof fabric.Image;
};
export const isGroup = (thing) => {
  return thing instanceof fabric.Group;
};
export const isIText = (thing) => {
  return thing instanceof fabric.IText;
};
export const isActiveSelection = (thing) => {
  return thing instanceof fabric.ActiveSelection;
};
/**
 * 系统层/固定层对象：交互态固定（不可选中编辑），绘制模式批量解锁时必须跳过，
 * 否则背景图等会被解锁成普通图片可被选中（workspace / 背景图 / 蒙版覆盖层 / 标尺辅助线）
 */
export const isFixedLayerObject = (obj) => {
  if (!obj) return false;
  return (
    obj.id === 'workspace' ||
    obj.id === 'backgroundImage' ||
    obj.id === 'coverMask' ||
    (!!fabric.GuideLine && obj instanceof fabric.GuideLine)
  );
};
export function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(reader.result);
    });
    reader.readAsDataURL(blob);
  });
}
export function base64ToBlob(base64Data) {
  if (!base64Data) {
    return null;
  }
  const dataArr = base64Data.split(',');
  const imageType = dataArr[0].match(/:(.*?);/)[1];
  const textData = window.atob(dataArr[1]);
  const arrayBuffer = new ArrayBuffer(textData.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < textData.length; i++) {
    uint8Array[i] = textData.charCodeAt(i);
  }
  return [new Blob([arrayBuffer], { type: imageType }), imageType.slice(6)];
}
export default {
  getImgStr,
  downFile,
  selectFiles,
  insertImgFile,
  clipboardText,
  drawImg,
  isImage,
  isGroup,
  isIText,
  isActiveSelection,
  isFixedLayerObject,
  blobToBase64,
  base64ToBlob,
};
