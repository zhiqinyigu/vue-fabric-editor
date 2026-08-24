<template>
  <div data-color-palette="input-hex-container">
    <input data-color-palette="input-hex" type="text" :value="value" @input="onInput" />
    <Label>HEX</Label>
  </div>
</template>

<script>
import Label from './label.vue';

export default {
  name: 'VcpInputHex',
  components: { Label },
  props: {
    value: {
      type: String,
      required: true,
    },
  },
  methods: {
    onInput(event) {
      this.$emit('update:value', event.target.value);
    },
  },
};
</script>

<style>
.color-palette [data-color-palette='input-hex-container'] {
  display: flex;
  flex-direction: column;
  width: 96px;
  flex-shrink: 0;
  align-items: center;
}

.color-palette [data-color-palette='input-hex'] {
  background-color: var(--muted);
  color: var(--foreground);
  border: none;
  outline: none;
  padding: 4px 8px;
  border-radius: 4px;
  height: 32px;
  width: 100%;
  text-align: center;
}
</style>
