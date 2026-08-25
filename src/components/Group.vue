<!--
 * @Author: 秦少卫
 * @Date: 2022-09-03 19:16:55
 * @LastEditors: 秦少卫
 * @LastEditTime: 2024-10-07 17:21:29
 * @Description: 组合与拆分组合
-->

<template>
  <div v-if="isMultiple || isGroup" class="attr-item-box">
    <div class="bg-item">
      <!-- 组合按钮 多选时不可用 -->
      <Button v-if="isMultiple" long :disabled="!isMultiple" type="text" @click="group">
        <GroupIcon width="14" height="14"></GroupIcon>
        {{ $t('attrSeting.group') }}
      </Button>
      <!-- 拆分组合按钮，为单选且组元素时可用 -->
      <Button v-if="isGroup" long :disabled="!isGroup" type="text" @click="unGroup">
        <UnGroupIcon width="14" height="14"></UnGroupIcon>
        {{ $t('attrSeting.unGroup') }}
      </Button>
    </div>

    <!-- <Divider plain v-if="isGroup"></Divider> -->
  </div>
</template>

<script>
import useSelect from '@/hooks/select';
import GroupIcon from '@/assets/icon/group/group.svg';
import UnGroupIcon from '@/assets/icon/group/unGroup.svg';

export default {
  name: 'Group',
  components: {
    GroupIcon,
    UnGroupIcon,
  },
  setup() {
    const { isGroup, isMultiple, canvasEditor } = useSelect();

    // 拆分组
    const unGroup = () => {
      canvasEditor.unGroup();
    };
    const group = () => {
      canvasEditor.group();
    };

    return {
      isGroup,
      isMultiple,
      unGroup,
      group,
    };
  },
};
</script>
<style scoped lang="less">
/deep/ .ivu-btn {
  &[disabled] {
    svg {
      opacity: 0.2;
    }
  }
}
</style>
