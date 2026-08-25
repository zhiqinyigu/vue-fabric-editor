/*
 * 序列化诊断：toObject 中途抛错（如文本 styles undefined 走 fabric stylesToArray 崩）时，
 * 逐对象定位崩溃对象并输出补丁在位状态，避免"整体报错但不知道哪个对象/为什么"。
 * 仅在异常路径执行，正常序列化零开销。
 */
import { fabric } from 'fabric';

export default function diagnoseSerializeError(err, canvas) {
  const offender = [];
  (canvas && canvas._objects ? canvas._objects : []).forEach((o, i) => {
    try {
      if (o && o.toObject) {
        // 复用对象默认裁剪参数序列化单对象，与画布序列化同链路
        o.toObject();
      }
    } catch (e) {
      offender.push({ index: i, type: o.type, id: o.id, text: o.text, err: e.message });
    }
  });
  // eslint-disable-next-line no-console
  console.warn('[vfe/history] 序列化异常定位', {
    error: (err && err.message) || err,
    stylesCompat补丁在位: !!fabric.util[Symbol.for('vfe.stylesCompatInstalled')],
    items: offender,
  });
}
