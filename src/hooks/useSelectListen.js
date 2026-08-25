/*
 * @Descripttion: useSelectListen
 * @version:
 * @Author: wuchenguang1998
 * @Date: 2024-05-04 14:36:49
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-07-06 12:15:19
 */
import { reactive, onMounted, onBeforeMount } from '@vue/composition-api';
import { EventType } from '@/core/index';
import { get } from 'lodash-es';

const { SelectEvent, SelectMode } = EventType;

export default function useSelectListen(canvasEditor) {
  const state = reactive({
    mSelectMode: SelectMode.EMPTY,
    mSelectOneType: '',
    mSelectId: '', // 选择id
    mSelectIds: [], // 选择id
    mSelectActive: [],
  });

  const selectOne = (e) => {
    state.mSelectMode = SelectMode.ONE;
    state.mSelectActive = e;
    if (e[0] && get(e[0], 'clip')) {
      // 裁切 shell（临时交互层）选中：整体判空（常规属性面板全隐藏，不匹配常规类型）
      selectCancel();
      return;
    }
    if (e[0]) {
      state.mSelectId = e[0].id;
      state.mSelectOneType = e[0].type;
      state.mSelectIds = e.map((item) => item.id);
    }
  };

  const selectMulti = (e) => {
    state.mSelectMode = SelectMode.MULTI;
    state.mSelectId = '';
    state.mSelectIds = e.map((item) => item.id);
  };

  const selectCancel = () => {
    state.mSelectId = '';
    state.mSelectIds = [];
    state.mSelectMode = SelectMode.EMPTY;
    state.mSelectOneType = '';
  };

  onMounted(() => {
    canvasEditor.on(SelectEvent.ONE, selectOne);
    canvasEditor.on(SelectEvent.MULTI, selectMulti);
    canvasEditor.on(SelectEvent.CANCEL, selectCancel);
  });

  onBeforeMount(() => {
    canvasEditor.off(SelectEvent.ONE, selectOne);
    canvasEditor.off(SelectEvent.MULTI, selectMulti);
    canvasEditor.off(SelectEvent.CANCEL, selectCancel);
  });

  return {
    mixinState: state,
  };
}
