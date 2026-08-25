<template>
  <div class="tab-panel" :style="rootStyle">
    <slot />
  </div>
</template>

<script>
import { computed, inject, ref } from '@vue/composition-api';

export default {
  name: 'TabPanel',
  props: {
    // Tabs 会用到 label
    label: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const tabsRef = inject('tabsRef');

    const active = ref(false);
    const rootStyle = computed(() => ({
      display: active.value ? 'block' : 'none',
    }));

    function changeActive(value) {
      active.value = value;
    }

    // 注册到父级 Tabs
    if (tabsRef) {
      tabsRef.value.push({
        label: props.label,
        changeActive,
      });
    }

    return {
      rootStyle,
      changeActive,
    };
  },
};
</script>
