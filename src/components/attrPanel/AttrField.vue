<!--
 * @Author: cyc
 * @Date: 2026-08-25 16:34:40
 * @LastEditors: cyc
 * @LastEditTime: 2026-08-25 15:43:18
 * @Description: 属性面板规范字段组件
-->

<script>
/**
 * 单格字段：灰底单元格（label + 内容 + 可选左右插槽）。
 * 当父元素为 AttrMultiField 时，用 render 自动包裹 <Col> 参与栅格分列：
 * 列宽由字段 span 优先、容器 cols 兜底，默认等宽 flex:1。
 * 独立使用（父不是 AttrMultiField）时不包 Col，保持原样。
 * 灰底归属：bare=true 时自身透明（灰底由容器提供，场景A）；非 bare 时自带灰底（场景B 独立灰格）。
 */
export default {
  name: 'AttrField',
  inject: {
    attrMultiField: { default: null },
    attrMultiCols: { default: null },
  },
  props: {
    /**
     * 字段左侧标签文案。留空且未使用 #label 插槽时，标签不渲染。
     * 常用于「label + 右侧控件」的单格字段（颜色、圆角、边框等）。
     */
    label: { type: String, default: '' },
    /**
     * 标签固定列宽（px 数字或 CSS 宽度字符串）。传值后标签占固定宽度、内容区占满剩余空间；
     * 不传则标签按内容自适应。典型用于左侧字段（如 40px 的「角度/透明度」）。
     */
    labelWidth: { type: [String, Number], default: null },
    /**
     * 透明模式：去除灰底、内边距、圆角与下边距。用于 AttrMultiField（场景A）内的单元格，
     * 灰底由容器提供，自身透明不叠加。
     */
    bare: { type: Boolean, default: false },
    /**
     * 紧凑模式：去掉下边距。用于紧邻的行，避免额外行距。
     */
    flush: { type: Boolean, default: false },
    /**
     * 输入态：无 label 的纯输入字段（如文本内容、网络图片地址）恢复输入框特征
     * （细描边 + 浅色内底），容器保持灰底，让「可输入」一眼可辨。
     */
    editable: { type: Boolean, default: false },
    /**
     * 左右分布模式：标签靠左、控件靠右（justify-content: space-between）。
     * 用于「标签 + 开关/滑块/颜色」的一行控件（如省略号、自适应增高、图像描边）。
     * 配合 bare 可用于灰底组容器内的行。
     */
    split: { type: Boolean, default: false },
    /**
     * 栅格列宽（iView Col span，如 18/6）。仅当父为 AttrMultiField 时生效，
     * 优先于容器的 cols；不传时用容器 cols 兜底，仍无则等宽 flex:1。
     */
    span: { type: [Number, String], default: null },
    /**
     * 不恢复输入框特征：让字段内数字框/输入框透出容器灰底（透明化），
     * 使其与相邻（如 Slider）单元格视觉等高、融为一体。适用于数字框紧邻滑块的双列布局。
     */
    noInput: { type: Boolean, default: false },
  },
  computed: {
    hasLabel() {
      return !!this.label || !!this.$slots.label;
    },
    classes() {
      return {
        'attr-field--bare': this.bare,
        'attr-field--flush': this.flush,
        'attr-field--editable': this.editable,
        'attr-field--split': this.split,
        'attr-field--no-input': this.noInput,
      };
    },
    labelStyle() {
      if (this.labelWidth == null) return {};
      const w = typeof this.labelWidth === 'number' ? `${this.labelWidth}px` : this.labelWidth;
      return { width: w, flex: `0 0 ${w}` };
    },
    colProps() {
      if (this.span != null) return { span: this.span };
      const cols = this.attrMultiCols;
      if (Array.isArray(cols)) {
        const idx = this.colIndex;
        if (idx >= 0 && idx < cols.length && cols[idx] != null) return { span: cols[idx] };
      }
      return { flex: '1' };
    },
    colIndex() {
      const parent = this.attrMultiField;
      if (!parent || !parent.$slots || !parent.$slots.default) return -1;
      const slots = parent.$slots.default;
      const idx = slots.indexOf(this.$vnode);
      return idx;
    },
  },
  render(h) {
    const children = [];
    if (this.hasLabel) {
      const labelContent = this.$slots.label ? this.$slots.label : this.label;
      children.push(
        h('span', { class: 'attr-field__label', style: this.labelStyle }, labelContent)
      );
    }
    if (this.$slots.left) {
      children.push(h('div', { class: 'attr-field__left' }, this.$slots.left));
    }
    children.push(h('div', { class: 'attr-field__content' }, this.$slots.default));
    if (this.$slots.right) {
      children.push(h('div', { class: 'attr-field__right' }, this.$slots.right));
    }

    const inner = h('div', { class: ['attr-field', this.classes] }, children);

    // 父为 AttrMultiField 时自动包 Col
    if (this.attrMultiField) {
      return h('Col', { props: this.colProps }, [inner]);
    }
    return inner;
  },
};
</script>

<style lang="less" scoped>
.attr-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  background: #f6f7f9;
  border-radius: 4px;
  margin-bottom: 8px;

  &--bare {
    background: transparent;
    padding: 0;
    border-radius: 0;
    margin-bottom: 0;
    .attr-field__label {
      padding-left: 0;
    }
  }
  &--flush {
    margin-bottom: 0;
  }
  &--editable {
    padding: 4px 6px;
  }
  &--split {
    justify-content: space-between;
    gap: 20px;
    min-height: 32px;
    box-sizing: border-box;
    .attr-field__label {
      padding-left: 0;
    }
    .attr-field__content {
      flex: none;
    }
    // 独立 split 行自带灰底与内边距；与 bare 组合（灰底容器内，如 AttrGroup）时不叠加 padding
    &:not(.attr-field--bare) {
      padding: 5px 8px;
      border-radius: 5px;
    }
  }

  &__label {
    flex-shrink: 0;
    padding-left: 4px;
    font-size: 14px;
    color: #333;
    white-space: nowrap;
  }
  &__left {
    flex: 1;
    min-width: 0;
  }
  &__content {
    flex: 1;
    min-width: 0;
  }
  &__right {
    flex: 1;
    min-width: 0;
    margin-left: 10px;
  }
}
</style>

<!-- 插槽内容在父组件作用域编译，scoped 样式无法命中，需全局样式（以 .attr-field 命名空间收敛） -->
<style lang="less">
.attr-field {
  // 对齐按钮组 / 字号按钮组
  .ivu-radio-group-button {
    display: flex;
    flex: 1;
    width: 100%;
    & .ivu-radio-wrapper {
      flex: 1;
      line-height: 40px;
      text-align: center;
      svg {
        vertical-align: baseline;
      }
    }
  }
  .ivu-radio-group-button.ivu-radio-group-large .ivu-radio-wrapper {
    font-size: 24px;
  }
  .ivu-btn-group {
    display: flex;
    flex: 1;
    .ivu-btn {
      flex: 1;
    }
  }
  .ivu-btn-group-large > .ivu-btn {
    font-size: 24px;
    flex: 1;
  }
  .button-group {
    display: flex;
    width: 100%;
    .ivu-btn,
    .ivu-radio-wrapper {
      flex: 1;
    }
  }
  // 字段内 Input / Select 统一透出容器灰底（去边框）
  .--input,
  .ivu-input,
  .color-palette-trigger__trigger,
  .ivu-select-selection {
    background-color: transparent;
    border: none !important;
    box-shadow: none !important;
  }
  // 无 label 的纯输入字段：恢复输入框特征（细描边 + 浅色内底），仍保持灰调
  &.attr-field--editable {
    .ivu-input {
      background: rgba(255, 255, 255, 0.6);
      border: 1px solid #dcdee2 !important;
      border-radius: 4px;
    }
  }
  // 左右分布模式：右侧控件适配（tooltip 可换行、数字框撑满）
  &.attr-field--split {
    .ivu-tooltip-inner {
      max-width: none;
      white-space: pre-wrap;
    }
    .ivu-input-number {
      display: block;
      flex: 1;
    }
  }
  // 不恢复输入框特征：数字框透出容器灰底，与相邻单元格等高（去掉自身灰底与边框）
  &.attr-field--no-input {
    .ivu-input-number,
    .ivu-input-number-input,
    .ivu-input-number-handler-wrap {
      background: transparent;
      border: none !important;
      box-shadow: none !important;
    }
    .ivu-input-number-handler-wrap {
      border-left-color: transparent !important;
    }
  }
  // 透明单元格内滑块：收紧上下留白，与相邻数字框等高（数字框默认高 32px）
  &.attr-field--bare {
    min-height: 32px;
    box-sizing: border-box;
    .ivu-slider-wrap {
      margin: 14px 0;
    }
  }
}
</style>
