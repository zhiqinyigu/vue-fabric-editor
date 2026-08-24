<template>
  <div data-color-palette="input-number-container">
    <div data-color-palette="input-number-inner">
      <Label v-if="label && labelPosition === 'left'">{{ label }}</Label>
      <section>
        <input
          data-color-palette="input-number"
          type="number"
          :min="min"
          :max="max"
          :value="value"
          :style="inputStyle"
          @input="onInput"
        />
        <span v-if="suffix" data-color-palette="input-number-suffix" :style="inputSuffixStyle">
          {{ suffix }}
        </span>
      </section>
    </div>
    <Label v-if="label && labelPosition === 'bottom'">{{ label }}</Label>
  </div>
</template>

<script>
import Label from './label.vue';

export default {
  name: 'VcpInputNumber',
  components: { Label },
  props: {
    value: {
      type: Number,
      required: true,
    },
    suffix: {
      type: String,
      default: undefined,
    },
    label: {
      type: String,
      default: undefined,
    },
    labelPosition: {
      type: String,
      default: 'left',
    },
    min: {
      type: Number,
      default: 0,
    },
    max: {
      type: Number,
      default: 100,
    },
  },
  computed: {
    inputStyle() {
      if (!this.suffix) {
        return {
          width: '100%',
        };
      }
      const width = String(this.value).length * 10;
      return {
        width: `${width}px`,
      };
    },
    inputSuffixStyle() {
      return {
        fontSize: this.suffix === '°' ? '16px' : '10px',
      };
    },
  },
  watch: {
    value(value) {
      if (Number.isNaN(value) || !value) {
        this.$emit('update:value', this.min);
        return;
      }

      if (value > this.max) this.$emit('update:value', this.max);
      if (value < this.min) this.$emit('update:value', this.min);
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
.color-palette [data-color-palette='input-number-container'] {
  display: flex;
  flex-direction: column;
  min-width: 0;
  align-items: center;
}

.color-palette [data-color-palette='input-number-inner'] {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
}

.color-palette [data-color-palette='input-number-inner'] > section {
  display: flex;
  align-items: center;
  background-color: var(--muted);
  border-radius: 4px;
  height: 32px;
  padding: 0 8px;
  width: 100%;
}

.color-palette [data-color-palette='input-number'] {
  background-color: transparent;
  color: var(--foreground);
  border: none;
  outline: none;
  text-align: center;
  font-size: 14px;
  line-height: 20px;
}

.color-palette [data-color-palette='input-number-icon'] {
  color: var(--muted-foreground);
  width: 12px;
  height: 12px;
}

.color-palette [data-color-palette='input-number-suffix'] {
  color: var(--muted-foreground);
  user-select: none;
}
</style>
