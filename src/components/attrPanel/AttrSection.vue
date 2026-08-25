<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 16:34:40
 * @Description: 属性面板规范区块组件
-->

<template>
  <div v-show="show" class="attr-sec attr-item-box">
    <Divider v-if="title" plain orientation="left">
      <h4>{{ title }}</h4>
    </Divider>
    <slot />
  </div>
</template>

<script>
export default {
  name: 'AttrSection',
  props: {
    title: { type: String, default: '' },
    /**
     * 是否显示分组。
     * 注意：根节点使用 v-show（而非 v-if）控制显示，切不可改为 v-if——
     * 否则会卸载插槽内「自监听 selectOne 事件」的子组件，使其错过事件、初始化不到选中状态。
     * 详见 src/views/home/components/right/index.vue 图片操作分组处说明。
     */
    show: { type: Boolean, default: true },
  },
};
</script>

<style lang="less" scoped>
.attr-sec {
  /deep/ .ivu-divider-plain {
    &.ivu-divider-with-text-left {
      margin: 10px 0;
      font-weight: bold;
      font-size: 16px;
      color: #000000;
    }
  }
  h4 {
    margin: 0;
    font-size: 14px;
  }
}
</style>
