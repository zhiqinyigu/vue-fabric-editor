<script>
import { ref, computed, watch, onMounted, nextTick } from '@vue/composition-api';
import { isNumber, isUndefined } from 'lodash-es';
import NP from 'number-precision';

NP.enableBoundaryChecking(false);

export default {
  name: 'InputNumber',
  model: {
    prop: 'modelValue',
    event: 'update:modelValue',
  },
  props: {
    autofocus: { type: Boolean, default: false },
    parser: { type: Function, default: null },
    formatter: { type: Function, default: null },
    min: { type: Number, default: -Infinity },
    max: { type: Number, default: Infinity },
    precision: { type: Number, default: 2 },
    step: { type: Number, default: 1 },
    modelValue: { type: Number, default: null },
    defaultValue: { type: Number, default: null },
    modelEvent: { type: String, default: 'change' },
    controlsOutside: { type: Boolean, default: false },
    hideButton: { type: Boolean, default: false },
    downDisabled: { type: Boolean, default: false },
    upDisabled: { type: Boolean, default: false },
    size: { type: String, default: 'default' },
    disabled: { type: Boolean, default: false },
    readonly: { type: Boolean, default: false },
    placeholder: { type: String, default: '' },
    append: { type: String, default: '' },
    prepend: { type: String, default: '' },
  },
  setup(props, { emit }) {
    const prefixCls = 'ivu-input-number';
    const iconPrefixCls = 'ivu-icon';
    const inputWrapClasses = ref(`${prefixCls}-input-wrap`);
    const inputClasses = ref(`${prefixCls}-input`);
    const handlerClasses = ref(`${prefixCls}-handler-wrap`);
    const innerUpClasses = ref(
      `${prefixCls}-handler-up-inner ${iconPrefixCls} ${iconPrefixCls}-ios-arrow-up`
    );
    const innerDownClasses = ref(
      `${prefixCls}-handler-down-inner ${iconPrefixCls} ${iconPrefixCls}-ios-arrow-down`
    );
    const upClasses = ref([
      `${prefixCls}-handler`,
      `${prefixCls}-handler-up`,
      {
        [`${prefixCls}-handler-up-disabled`]: props.upDisabled,
      },
    ]);
    const downClasses = ref([
      `${prefixCls}-handler`,
      `${prefixCls}-handler-down`,
      {
        [`${prefixCls}-handler-down-disabled`]: props.downDisabled,
      },
    ]);

    const focused = ref(false);

    const wrapClasses = computed(() => {
      return [
        `${prefixCls}`,
        {
          [`${prefixCls}-${props.size}`]: !!props.size,
          [`${prefixCls}-disabled`]: props.disabled,
          [`${prefixCls}-focused`]: focused.value,
          [`${prefixCls}-controls-outside`]: props.controlsOutside,
        },
      ];
    });

    const inputRef = ref(null);

    const mergedPrecision = computed(() => {
      if (isNumber(props.precision)) {
        const decimal = `${props.step}`.split('.')[1];
        const stepPrecision = (decimal && decimal.length) || 0;
        return Math.max(stepPrecision, props.precision);
      }
      return undefined;
    });

    const getStringValue = (number) => {
      if (!isNumber(number)) {
        return '';
      }

      const numString = mergedPrecision.value
        ? number.toFixed(mergedPrecision.value).replace(/\.?0+$/, '')
        : String(number);
      return props.formatter ? props.formatter(numString) : numString;
    };

    const _value = ref(getStringValue(props.modelValue ?? props.defaultValue));

    const handleFocus = (event) => {
      focused.value = true;
      emit('on-focus', event);
    };

    const handleBlur = (event) => {
      focused.value = false;
      emit('on-blur', event);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        !props.readonly && nextStep('plus', e);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        !props.readonly && nextStep('minus', e);
      }
    };

    const nextStep = (method, event) => {
      if (
        (method === 'plus' && (isMax.value || props.upDisabled)) ||
        (method === 'minus' && (isMin.value || props.downDisabled))
      ) {
        return;
      }
      let nextValue;
      if (isNumber(valueNumber.value)) {
        nextValue = getLegalValue(NP[method](valueNumber.value, props.step));
      } else {
        nextValue = props.min === -Infinity ? 0 : props.min;
      }
      _value.value = getStringValue(nextValue);
      updateNumberStatus(nextValue);
      emit('update:modelValue', nextValue);
      emit('on-change', nextValue, event);
    };

    // 步长重复定时器
    let repeatTimer = 0;
    const SPEED = 150;
    const clearRepeatTimer = () => {
      if (repeatTimer) {
        window.clearTimeout(repeatTimer);
        repeatTimer = 0;
      }
    };

    const minus = (e) => {
      handleStepButton(e, 'minus', true);
    };
    const plus = (e) => {
      handleStepButton(e, 'plus', true);
    };

    const handleStepButton = (event, method, needRepeat = false) => {
      event.preventDefault();
      inputRef.value && inputRef.value.focus();
      nextStep(method, event);
      // 长按时持续触发
      if (needRepeat) {
        repeatTimer = window.setTimeout(() => handleStepButton(event, method, true), SPEED);
      }
    };

    const valueNumber = computed(() => {
      if (!_value.value) {
        return undefined;
      }
      const number = Number(props.parser ? props.parser(_value.value) : _value.value);
      return Number.isNaN(number) ? undefined : number;
    });

    const isMin = ref(isNumber(valueNumber.value) && valueNumber.value <= props.min);
    const isMax = ref(isNumber(valueNumber.value) && valueNumber.value >= props.max);

    const updateNumberStatus = (number) => {
      let _isMin = false;
      let _isMax = false;
      if (isNumber(number)) {
        if (number <= props.min) {
          _isMin = true;
        }
        if (number >= props.max) {
          _isMax = true;
        }
      }
      if (isMax.value !== _isMax) {
        isMax.value = _isMax;
      }
      if (isMin.value !== _isMin) {
        isMin.value = _isMin;
      }
    };

    const handleInput = (e) => {
      let { value } = e.target;
      value = value.trim().replace(/。/g, '.');
      value = props.parser ? props.parser(value) : value;
      if (isNumber(Number(value)) || /^(\.|-)$/.test(value)) {
        _value.value = props.formatter ? props.formatter(value) : value;
        updateNumberStatus(valueNumber.value);
        if (props.modelEvent === 'input') {
          emit('update:modelValue', valueNumber.value);
        }
        emit('on-input', valueNumber.value, _value.value, e);
      }
    };

    const getLegalValue = (value) => {
      if (isUndefined(value)) {
        return undefined;
      }
      if (isNumber(props.min) && value < props.min) {
        value = props.min;
      }
      if (isNumber(props.max) && value > props.max) {
        value = props.max;
      }
      return isNumber(mergedPrecision.value) ? NP.round(value, mergedPrecision.value) : value;
    };

    const handleChange = (e) => {
      const finalValue = getLegalValue(valueNumber.value);
      const stringValue = getStringValue(finalValue);
      if (finalValue !== valueNumber.value || _value.value !== stringValue) {
        _value.value = stringValue;
        updateNumberStatus(finalValue);
      }
      nextTick(() => {
        if (isNumber(props.modelValue) && props.modelValue !== finalValue) {
          _value.value = getStringValue(props.modelValue);
          updateNumberStatus(props.modelValue);
        }
      });
      emit('update:modelValue', finalValue);
      emit('on-change', finalValue, e);
    };

    const handleExceedRange = () => {
      const finalValue = getLegalValue(valueNumber.value);
      const stringValue = getStringValue(finalValue);
      if (finalValue !== valueNumber.value || _value.value !== stringValue) {
        _value.value = stringValue;
      }
      emit('update:modelValue', finalValue);
    };

    // 滑动相关（以原生 PointerEvent 替代 @vueuse/core 的 usePointerSwipe）
    const appendLabelRef = ref(null);
    const prependLabelRef = ref(null);
    const useSwipe = (targetRef) => {
      const startValue = ref();
      const el = targetRef.value;
      if (!el) return;
      let startPos = { x: 0, y: 0 };
      const onPointerDown = (e) => {
        if (el.setPointerCapture) {
          el.setPointerCapture(e.pointerId);
        }
        startPos = { x: e.clientX, y: e.clientY };
        startValue.value = valueNumber.value;
      };
      const onPointerMove = (e) => {
        if (!isNumber(startValue.value)) return;
        const newValue = startValue.value + NP.round(e.clientX - startPos.x, 0) * props.step;
        // append 标签拖拽滑动：直接由数值推导提交，不得复用 handleInput/handleChange
        // （二者期望输入事件 e.target.value，PointerEvent 无此字段会抛 TypeError）
        const legalValue = getLegalValue(newValue);
        _value.value = getStringValue(legalValue);
        updateNumberStatus(legalValue);
        emit('update:modelValue', legalValue);
        emit('on-change', legalValue, e);
        if (props.modelEvent === 'input') {
          emit('on-input', legalValue, _value.value, e);
        }
      };
      const onPointerUp = () => {
        startValue.value = undefined;
      };
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
    };

    // mounted
    onMounted(() => {
      appendLabelRef.value && useSwipe(appendLabelRef);
      prependLabelRef.value && useSwipe(prependLabelRef);
    });

    // watch
    watch(
      () => props.modelValue,
      (value) => {
        if (value !== valueNumber.value) {
          _value.value = getStringValue(value);
          updateNumberStatus(value);
        }
      }
    );
    watch(
      () => props.min,
      (newVal) => {
        const _isMin = isNumber(valueNumber.value) && valueNumber.value <= newVal;
        if (isMin.value !== _isMin) {
          isMin.value = _isMin;
        }

        const isExceedMinValue = isNumber(valueNumber.value) && valueNumber.value < newVal;
        if (isExceedMinValue) {
          handleExceedRange();
        }
      }
    );
    watch(
      () => props.max,
      (newVal) => {
        const _isMax = isNumber(valueNumber.value) && valueNumber.value >= newVal;
        if (isMax.value !== _isMax) {
          isMax.value = _isMax;
        }

        const isExceedMaxValue = isNumber(valueNumber.value) && valueNumber.value > newVal;
        if (isExceedMaxValue) {
          handleExceedRange();
        }
      }
    );

    return {
      wrapClasses,
      inputWrapClasses,
      inputClasses,
      handlerClasses,
      innerUpClasses,
      innerDownClasses,
      upClasses,
      downClasses,
      inputRef,
      appendLabelRef,
      prependLabelRef,
      _value,
      handleFocus,
      handleBlur,
      handleKeyDown,
      minus,
      plus,
      clearRepeatTimer,
      handleInput,
      handleChange,
    };
  },
};
</script>

<template>
  <div :class="wrapClasses">
    <template v-if="controlsOutside">
      <div
        class="ivu-input-number-controls-outside-btn ivu-input-number-controls-outside-down"
        :class="{ 'ivu-input-number-controls-outside-btn-disabled': downDisabled }"
        @mousedown="minus"
        @mouseup="clearRepeatTimer"
        @mouseleave="clearRepeatTimer"
      >
        <i class="ivu-icon ivu-icon-ios-remove"></i>
      </div>
      <div
        class="ivu-input-number-controls-outside-btn ivu-input-number-controls-outside-up"
        :class="{ 'ivu-input-number-controls-outside-btn-disabled': upDisabled }"
        @mousedown="plus"
        @mouseup="clearRepeatTimer"
        @mouseleave="clearRepeatTimer"
      >
        <i class="ivu-icon ivu-icon-ios-add"></i>
      </div>
    </template>
    <div v-else-if="!hideButton" :class="handlerClasses">
      <a
        :class="upClasses"
        @mousedown="plus"
        @mouseup="clearRepeatTimer"
        @mouseleave="clearRepeatTimer"
      >
        <span :class="innerUpClasses"></span>
      </a>
      <a
        :class="downClasses"
        @mousedown="minus"
        @mouseup="clearRepeatTimer"
        @mouseleave="clearRepeatTimer"
      >
        <span :class="innerDownClasses"></span>
      </a>
    </div>
    <div :class="inputWrapClasses">
      <template v-if="$slots.prefix">
        <slot name="prefix"></slot>
      </template>
      <label v-else-if="append" ref="appendLabelRef" :class="`${inputWrapClasses}__label`">
        {{ append }}
      </label>
      <input
        ref="inputRef"
        type="text"
        autocomplete="off"
        spellcheck="false"
        role="spinbutton"
        :aria-valuemax="max"
        :aria-valuemin="min"
        :aria-valuenow="_value"
        :value="_value"
        :class="inputClasses"
        :disabled="disabled"
        :autofocus="autofocus"
        :readonly="readonly"
        :placeholder="placeholder"
        @focus="handleFocus"
        @blur="handleBlur"
        @input="handleInput"
        @change="handleChange"
        @keydown="handleKeyDown"
      />
      <template v-if="$slots.suffix">
        <slot name="suffix"></slot>
      </template>
      <label v-else-if="prepend" ref="prependLabelRef" :class="`${inputWrapClasses}__label`">
        {{ prepend }}
      </label>
    </div>
  </div>
</template>

<style scoped lang="less">
@css-prefix: ivu-;
@input-height-base: 32px;
@input-height-small: 24px;
@input-height-large: 36px;
@input-group-bg: #f6f7f9;

@input-number-prefix-cls: ~'@{css-prefix}input-number';

.@{input-number-prefix-cls} {
  border: none;
  background: @input-group-bg;

  &-input {
    background: none;
  }

  &-handler {
    height: (@input-height-base / 2);

    &-wrap {
      background: @input-group-bg;
      border-left-color: transparent;
    }

    &-down {
      border-top: none;
    }

    &-up-inner,
    &-down-inner {
      line-height: (@input-height-base / 2);
    }
  }

  &-input-wrap {
    display: flex;
    align-items: center;

    &__label {
      flex-shrink: 0;
      padding: 0 10px;
      user-select: none;
      cursor: ew-resize;
    }
  }

  &-small {
    .@{input-number-prefix-cls}-handler {
      height: (@input-height-small / 2);

      &-up-inner,
      &-down-inner {
        line-height: (@input-height-small / 2);
      }
    }
  }

  &-large {
    .@{input-number-prefix-cls}-handler {
      height: (@input-height-large / 2);

      &-up-inner,
      &-down-inner {
        line-height: (@input-height-large / 2);
      }
    }
  }
}
</style>
