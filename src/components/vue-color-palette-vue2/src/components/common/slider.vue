<template>
  <input
    data-color-palette="slider"
    class="slider"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="value"
    :style="{
      '--thumb-color': thumbColor,
      '--percent': percent,
    }"
    @input="onInput"
  />
</template>

<script>
export default {
  name: 'VcpSlider',
  props: {
    value: {
      type: Number,
      required: true,
    },
    min: {
      type: [Number, String],
      default: 0,
    },
    max: {
      type: [Number, String],
      default: 100,
    },
    step: {
      type: [Number, String],
      default: 1,
    },
    thumbColor: {
      type: String,
      default: 'white',
    },
  },
  computed: {
    percent() {
      const min = Number(this.min);
      const max = Number(this.max);
      return `${((this.value - min) / (max - min)) * 100}%`;
    },
  },
  methods: {
    onInput(event) {
      this.$emit('update:value', Number(event.target.value));
    },
  },
};
</script>

<style>
.color-palette [data-color-palette='slider'] {
  background: linear-gradient(to right, var(--primary) var(--percent), var(--muted) var(--percent));
}
</style>
