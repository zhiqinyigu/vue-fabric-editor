/*
 * @Author: cyc
 * @Date: 2026-08-27 11:05:16
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-27 11:05:16
 * 统一图片来源选择器（本地图片 / 在线URL / CDN上传）
 * 模块级单例状态，供 tools.vue 与 bgBar.vue 等共享同一个弹窗实例（弹窗挂载在 home/index.vue 根节点）。
 * mode: 'insert'（插入画布元素，默认） / 'background'（设为背景）
 * onDone(src, meta): 由调用方决定最终去向（元素 or 背景）。
 */
import { reactive } from '@vue/composition-api';

const state = reactive({
  open: false,
  mode: 'insert',
  onDone: null,
});

function openImagePicker({ mode = 'insert', onDone } = {}) {
  state.mode = mode;
  state.onDone = onDone || null;
  state.open = true;
}

function closeImagePicker() {
  state.open = false;
}

export default function useImagePicker() {
  return {
    pickerState: state,
    openImagePicker,
    closeImagePicker,
  };
}
