<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-02-06 17:00:13
 * @Description: 回退重做
-->

<template>
  <div style="display: inline-block">
    <!-- 后退 -->
    <Tooltip :content="$t('history.revocation') + `(${canUndo})`">
      <Button type="text" size="small" :disabled="!canUndo" @click="undo">
        <Icon type="ios-undo" size="20" />
      </Button>
    </Tooltip>

    <!-- 重做 -->
    <Tooltip :content="$t('history.redo') + `(${canRedo})`">
      <Button type="text" size="small" :disabled="!canRedo" @click="redo">
        <Icon type="ios-redo" size="20" />
      </Button>
    </Tooltip>
    <!-- <span class="time" v-if="history.length">
      {{ useDateFormat(history[0].timestamp, 'HH:mm:ss').value }}
    </span> -->
  </div>
</template>

<script>
import { ref, onMounted } from '@vue/composition-api';
import useSelect from '@/hooks/select';

export default {
  name: 'ToolBar',
  setup() {
    const { canvasEditor } = useSelect();
    const canUndo = ref(0);
    const canRedo = ref(0);
    // 后退
    const undo = () => {
      canvasEditor.undo();
    };
    // 重做
    const redo = () => {
      canvasEditor.redo();
    };

    onMounted(() => {
      canvasEditor.on('historyUpdate', (canUndoParam, canRedoParam) => {
        canUndo.value = canUndoParam;
        canRedo.value = canRedoParam;
      });
    });

    return {
      canUndo,
      canRedo,
      undo,
      redo,
    };
  },
};
</script>

<style scoped lang="less">
span.active {
  svg.icon {
    fill: #2d8cf0;
  }
}

.time {
  color: #c1c1c1;
}
</style>
