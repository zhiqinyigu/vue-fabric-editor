/*
 * @Author: cyc
 * @Date: 2026-08-27 11:12:28
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-01 10:27:16
 * 二维码 / 条形码 生成纯函数（编辑器与前台渲染器共用）
 * - 输入 extension 参数，输出 dataURL
 * - 不依赖画布 / 编辑器实例，便于渲染器按 JSON 参数动态还原
 * 注意：此类共享模块禁止引入 UI / 编辑相关依赖，保持 tree-shaking 友好。
 */
import QRCodeStyling from 'qr-code-styling';
import JsBarcode from 'jsbarcode';
import { blobToBase64 } from './utils/utils';

// 二维码参数（编辑器 extension 字段） -> qr-code-styling 配置
export function qrParamsToOption(option) {
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

// 根据二维码参数生成 dataURL（入参为 qr-code-styling 配置，即 qrParamsToOption 的输出）
export async function generateQrCodeDataURL(options) {
  const qrCode = new QRCodeStyling(options);
  const blob = await qrCode.getRawData('png');
  if (!blob) return '';
  return blobToBase64(blob);
}

// 根据条形码参数生成 dataURL（入参为条形码 extension 参数）
export function generateBarcodeDataURL(option) {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, option.value, {
    ...option,
  });
  return canvas.toDataURL('image/png', 1);
}