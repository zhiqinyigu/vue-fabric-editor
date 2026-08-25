<template>
  <Header>
    <div class="left">
      <!-- 导入 -->
      <ImportJson />
      <Divider type="vertical" />
      <!-- <Button type="text" to="/template" target="_blank">全部模板</Button> -->
      <!-- <Divider type="vertical" /> -->

      <MyTemplName />
      <!-- 标尺开关 -->
      <!-- <Tooltip :content="$t('grid')">
        <iSwitch v-model="toggleModel" size="small" class="switch"></iSwitch>
      </Tooltip>
      <Divider type="vertical" /> -->
      <History />
    </div>

    <div class="right">
      <!-- 管理员模式 -->
      <Admin />
      <!-- 预览 -->
      <PreviewCurrent />
      <Save />
    </div>
  </Header>
</template>

<script>
import { computed } from '@vue/composition-api';
// 导入元素
import ImportJson from '@/components/importJSON.vue';

// 顶部组件
import MyTemplName from '@/components/myTemplName.vue';
import PreviewCurrent from '@/components/PreviewCurrent.vue';
import Save from '@/components/Save.vue';
import Admin from '@/components/admin';
import History from '@/components/History.vue';

export default {
  name: 'Top',
  components: {
    ImportJson,
    MyTemplName,
    PreviewCurrent,
    Save,
    Admin,
    History,
  },
  props: {
    ruler: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const toggleModel = computed({
      get() {
        return props.ruler;
      },
      set(value) {
        emit('update:ruler', value);
      },
    });

    return {
      toggleModel,
    };
  },
};
</script>

<style lang="less" scoped>
.left {
  padding-left: 20px;
}
.left,
.right {
  display: flex;
  align-items: center;
  img {
    display: block;
    margin-right: 10px;
  }
}
</style>
