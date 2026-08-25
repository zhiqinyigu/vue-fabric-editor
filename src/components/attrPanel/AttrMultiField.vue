<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 16:34:40
 * @Description: 属性面板多字段行组件
-->

<template>
  <div class="attr-multi" :class="{ 'attr-multi--plain': noBackground }">
    <Row :gutter="gutter">
      <slot />
    </Row>
  </div>
</template>

<script>
/**
 * 多列字段容器：内部使用 iView Row/Col 栅格分列。
 * 子列（AttrField）会自动包 Col；列宽由「AttrField span」优先、本容器 cols 兜底，默认等宽 flex:1。
 * 灰底归属可配置：
 *  - noBackground=false（默认）：整行一个灰底容器，子列用 AttrField bare（透明不叠加）
 *  - noBackground=true：容器透明，灰底由子列 AttrField（非 bare）各自提供，列间距透出白底（独立灰格留白）
 */
export default {
  name: 'AttrMultiField',
  provide() {
    return {
      attrMultiField: this,
      attrMultiCols: this.cols,
    };
  },
  props: {
    /** 列间距（px），透传 iView Row :gutter */
    gutter: { type: Number, default: 0 },
    /** 容器级列宽批量声明（如 [18, 6]），对应每列；字段级 AttrField span 优先覆盖 */
    cols: { type: Array, default: null },
    /** 是否去掉容器灰底（场景B）：容器透明，灰底由子列 AttrField 提供 */
    noBackground: { type: Boolean, default: false },
  },
};
</script>

<!-- 容器灰底、圆角、内边距；子列内容在父作用域编译，需全局样式 -->
<style lang="less">
.attr-multi {
  width: 100%;
  margin-bottom: 5px;
  padding: 5px;
  border-radius: 5px;
  background: #f6f7f9;

  &--plain {
    background: transparent;
    padding: 0;
  }

  // 子列等宽（AttrField 若有 span 会以内联/优先级覆盖）
  .ivu-col {
    min-width: 0;
  }
}
</style>
