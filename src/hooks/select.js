/*
 * @Author: 秦少卫
 * @Date: 2024-10-07 17:12:29
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:14:13
 * @Description: 通用属性hook
 */

import { inject, computed, reactive, onMounted, onBeforeMount } from '@vue/composition-api';

import { EventType } from '@/core/index';
const { SelectMode, SelectEvent } = EventType;

import { useI18n } from './useI18n';

export default function useSelect(matchType) {
  const { t } = useI18n();
  const fabric = inject('fabric');
  const canvasEditor = inject('canvasEditor');

  const state = reactive({
    mSelectMode: SelectMode.EMPTY,
    mSelectOneType: '',
    mSelectId: '', // 选择id
    mSelectIds: [], // 选择id
    mSelectActive: [],
  });
  const selectOne = (arr) => {
    state.mSelectMode = SelectMode.ONE;
    const [item] = arr;
    if (item) {
      state.mSelectActive = [item];
      state.mSelectId = item.id;
      state.mSelectOneType = item.type;
      state.mSelectIds = [item.id];
    }
    callBack();
  };

  const selectMulti = (arr) => {
    state.mSelectMode = SelectMode.MULTI;
    state.mSelectId = '';
    state.mSelectIds = arr.map((item) => item.id);
    callBack();
  };

  const selectCancel = () => {
    state.mSelectId = '';
    state.mSelectIds = [];
    state.mSelectMode = SelectMode.EMPTY;
    state.mSelectOneType = '';
    callBack();
  };

  let callBack = () => {
    //
  };
  const getObjectAttr = (cb) => {
    callBack = cb;
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

  let isMatchType;
  if (matchType) {
    isMatchType = computed(() => matchType.includes(state.mSelectOneType));
  }
  const isOne = computed(() => state.mSelectMode === 'one');
  const isMultiple = computed(() => state.mSelectMode === 'multiple');
  const isGroup = computed(() => state.mSelectMode === 'one' && state.mSelectOneType === 'group');
  const isSelect = computed(() => state.mSelectMode);

  const selectType = computed(() => state.mSelectOneType);

  const matchTypeHander = (types) => {
    return computed(() => types.includes(state.mSelectOneType));
  };
  return {
    fabric,
    canvasEditor,
    mixinState: state,
    selectType,
    isSelect,
    isGroup,
    isOne,
    isMultiple,
    isMatchType,
    matchTypeHander,
    getObjectAttr,
    t,
  };
}
