<template>
  <div data-color-palette="collapse">
    <div data-color-palette="collapse-header">
      <Label v-if="title">{{ title }}</Label>

      <div data-color-palette="collapse-header-actions">
        <slot name="actions" />
        <Button :data-collapsed="collapsed" @click="toggleCollapse">
          <ChevronDownIcon />
        </Button>
      </div>
    </div>
    <div v-if="!collapsed" data-color-palette="collapse-content">
      <slot />
    </div>
  </div>
</template>

<script>
import Button from './button.vue';
import { Icon } from './icons';
import Label from './label.vue';

export default {
  name: 'VcpCollapse',
  components: { Button, Label, ChevronDownIcon: Icon.ChevronDown },
  props: {
    title: {
      type: String,
      default: '',
    },
    defaultCollapsed: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      collapsed: this.defaultCollapsed,
    };
  },
  methods: {
    toggleCollapse() {
      this.collapsed = !this.collapsed;
    },
  },
};
</script>

<style>
.color-palette [data-color-palette='collapse'] {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.color-palette [data-color-palette='collapse-header'] {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.color-palette [data-color-palette='collapse-header'] [data-collapsed='true'] {
  transform: rotate(180deg);
  transition-duration: var(--default-transition-duration);
}

.color-palette [data-color-palette='collapse-header-actions'] {
  display: flex;
  align-items: center;
}
</style>
