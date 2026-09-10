/*
 * @Author: cyc
 * @Date: 2026-09-10 16:04:07
 * @LastEditors: cyc
 * @LastEditTime: 2026-09-10 16:04:07
 * @Description: 向输入框光标位置插入文本（属性面板"插入变量"共用）
 */
/**
 * 计算"在光标处插入 token"后的新值与光标落点
 * - 有选区：替换选区
 * - 未聚焦/未知光标：追加到末尾
 * @param {HTMLInputElement|HTMLTextAreaElement|null} el 原生输入控件
 * @param {string} current 当前值
 * @param {string} token 待插入文本
 * @returns {{ next: string, caret: number, start: number, end: number }}
 */
export function insertAtCursor(el, current, token) {
  let start = (current || '').length;
  let end = start;
  if (el && typeof el.selectionStart === 'number') {
    start = el.selectionStart;
    end = el.selectionEnd;
  }
  const base = current || '';
  const next = base.slice(0, start) + token + base.slice(end);
  return { next, caret: start + token.length, start, end };
}

/**
 * 从 iview Input 组件实例取原生输入控件
 * @param {object} componentRef Input 组件 ref（$el）
 * @param {string} [selector] 默认 textarea 优先（多行），其次 input
 */
export function getInputElement(componentRef, selector) {
  if (!componentRef || !componentRef.$el) return null;
  return componentRef.$el.querySelector(selector || 'textarea, input');
}

/**
 * 回焦并把光标设置到指定位置（不支持 setSelectionRange 时静默忽略）
 */
export function focusCaret(el, caret) {
  if (!el || !el.focus) return;
  el.focus();
  try {
    el.setSelectionRange(caret, caret);
  } catch (e) {
    // 部分输入类型不支持选区 API，忽略
  }
}
