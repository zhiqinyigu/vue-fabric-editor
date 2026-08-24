<template>
  <!-- Vue 2 中父级 @click 是组件自定义事件，需显式 $emit('click') 才能触发（Vue 3 会自动透传到根元素，Vue 2 不会） -->
  <button data-color-palette="button" @click="$emit('click', $event)">
    <slot />
  </button>
</template>

<script>
export default {
  name: 'VcpButton',
};
</script>

<style>
.color-palette [data-color-palette='button'] {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px;
  background-color: transparent;
  color: var(--muted-foreground);
  transition-duration: var(--default-transition-duration);
  font-size: 14px;
  line-height: 20px;
}
.color-palette [data-color-palette='button']:hover {
  background-color: var(--muted);
  color: var(--foreground);
}
</style>
