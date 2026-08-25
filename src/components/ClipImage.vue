<template>
  <Tooltip v-if="isOne && type === 'image'" placement="top-end" :content="$t('createClip')">
    <Dropdown style="width: 100%" @on-click="handleClip">
      <Button type="text" long>
        <ClipIcon width="18" height="18" :class="{ 'clip-icon-active': isClipped }"></ClipIcon>
      </Button>
      <template #list>
        <DropdownMenu>
          <DropdownItem name="editClip" :disabled="!isClipped" divided>
            {{ $t('editClip') }}
          </DropdownItem>
          <DropdownItem
            name="remove"
            :disabled="!isClipped"
            :class="{ 'clip-remove-active': isClipped }"
          >
            {{ $t('removeClip') }}
          </DropdownItem>
          <DropdownItem
            v-for="(item, index) in options"
            :key="item.value"
            :name="item.value"
            :divided="index === 0"
          >
            {{ item.label }}
          </DropdownItem>
        </DropdownMenu>
      </template>
    </Dropdown>
  </Tooltip>
</template>

<script>
import { ref, getCurrentInstance, onMounted, onBeforeUnmount } from '@vue/composition-api';
import { get } from 'lodash-es';
import useSelect from '@/hooks/select';
import { useI18n } from '@/hooks/useI18n';
import ClipIcon from '@/assets/icon/tools/clip.svg';

export default {
  name: 'ReplaceImg',
  components: { ClipIcon },
  setup() {
    const update = getCurrentInstance();
    // const canvasEditor = inject('canvasEditor');
    const { canvasEditor, isOne } = useSelect();
    const { t } = useI18n();
    const type = ref('');
    const isClipped = ref(false);
    const options = [
      {
        label: t('polygonClip'),
        value: 'polygon',
      },
      {
        label: t('rectClip'),
        value: 'rect',
      },
      {
        label: t('circleClip'),
        value: 'circle',
      },
      {
        label: t('triangleClip'),
        value: 'triangle',
      },
      {
        label: t('polygonClipInverted'),
        value: 'polygon-inverted',
      },
      {
        label: t('rectClipInverted'),
        value: 'rect-inverted',
      },
      {
        label: t('circleClipInverted'),
        value: 'circle-inverted',
      },
      {
        label: t('triangleClipInverted'),
        value: 'triangle-inverted',
      },
    ];
    const addClipPath = async (name) => {
      canvasEditor.addClipPathToImage(name);
    };
    const removeClip = () => {
      canvasEditor.removeClip();
    };
    // 处于裁切状态：选中图片存在 clipPath
    const refreshClipState = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      isClipped.value = !!(activeObject && get(activeObject, 'clipPath'));
    };
    // 工具条下拉：editClip 重新进入既有裁切的编辑（无入口问题），remove 移除裁切，其余为形状类型
    const handleClip = async (name) => {
      if (name === 'editClip') {
        canvasEditor.enterClipEdit && canvasEditor.enterClipEdit();
      } else if (name === 'remove') {
        removeClip();
      } else {
        addClipPath(name);
      }
      // removeClip/editClip 会改变选中对象，selectOne 不会再次触发，需主动刷新裁切状态
      refreshClipState();
    };
    const init = () => {
      const activeObject = canvasEditor.canvas.getActiveObjects()[0];
      if (activeObject) {
        type.value = activeObject.type;
        refreshClipState();
        update?.proxy?.$forceUpdate();
      }
    };

    onMounted(() => {
      canvasEditor.on('selectOne', init);
    });

    onBeforeUnmount(() => {
      canvasEditor.off('selectOne', init);
    });

    return {
      isOne,
      type,
      isClipped,
      options,
      addClipPath,
      removeClip,
      handleClip,
    };
  },
};
</script>

<style lang="less" scoped>
// view-design 菜单容器 .ivu-select-dropdown 默认 width: inherit 会继承触发按钮的窄宽度，
// 而 DropdownItem 是 white-space: nowrap，长文本会溢出菜单，这里改为按内容自适应。
/deep/ .ivu-select-dropdown {
  width: max-content;
  min-width: 160px;
  max-width: 320px;
}
/deep/ .ivu-dropdown-item {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
// 处于裁切状态时，"移除裁切"项以主题色突出
/deep/ .ivu-dropdown-item.clip-remove-active {
  color: #2d8cf0;
  font-weight: 600;
}
// 处于裁切状态时，工具条图标以主题色突出
/deep/ .clip-icon-active path {
  fill: #2d8cf0;
}
</style>
