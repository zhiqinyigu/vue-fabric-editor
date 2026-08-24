<template>
  <label data-color-palette="label">
    <slot />
  </label>
</template>

<script>
export default {
  name: 'VcpLabel',
};
</script>

<style>
.color-palette [data-color-palette='label'] {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  white-space: nowrap;
}
</style>
