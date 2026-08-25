<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 16:34:40
 * @Description: 属性面板规范分组组件
-->

<template>
  <div class="attr-group">
    <slot name="head" />
    <slot />
  </div>
</template>

<script>
/**
 * 灰底联动容器：提供一个统一灰底容器，用于「头部触发控件 + 条件内容」的联动分组。
 * - #head 插槽：头部触发区（switch / radio 组 / 其它），使用方自定（通常为 AttrField split bare）
 * - 默认插槽：条件内容，随触发值 v-if 控制，与头部在同一个灰底容器内
 * 内部内容由使用方决定字段形式（slider 等用普通 AttrField label-width，开关/颜色等用 split bare）。
 */
export default {
  name: 'AttrGroup',
};
</script>

<style lang="less" scoped>
.attr-group {
  background: #f6f7f9;
  border-radius: 5px;
  padding: 5px 8px;
  margin-bottom: 8px;
}
</style>
