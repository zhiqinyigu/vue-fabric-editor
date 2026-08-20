<!--
 * @Author: cyc
 * @Date: 2026-08-20 10:15:11
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-20 10:15:11
 * @Description: 清空画布（从 Save.vue 抽离的独立组件）
 -->
<template>
  <Button style="margin-left: 10px" type="text" @click="beforeClear">
    {{ $t('save.empty') }}
  </Button>
</template>

<script>
import { Modal } from 'view-design';
import { useI18n } from '@/hooks/useI18n';
import useSelect from '@/hooks/select';

export default {
  name: 'ClearButton',
  setup() {
    const { t } = useI18n();
    const { canvasEditor } = useSelect();

    const clear = () => {
      canvasEditor.clear();
      // 清空后重置历史记录，避免清空后仍可撤销/重做
      canvasEditor.getPlugin('HistoryPlugin')?.clearAndSaveState?.();
    };

    const beforeClear = () => {
      Modal.confirm({
        title: t('tip'),
        content: `<p>${t('clearTip')}</p>`,
        okText: t('ok'),
        cancelText: t('cancel'),
        onOk: () => clear(),
      });
    };

    return {
      beforeClear,
    };
  },
};
</script>
