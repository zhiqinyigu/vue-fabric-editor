import { computed, ref } from '@vue/composition-api';
import { SHADCN_SCHEMAS } from '../constants';
import { isClient } from '../utils';
import { useMutationObserver } from './use-mutation-observer';

const reg = /^(?:hsl|rgb|oklch|lab|lch)\(/;

export function useTailwindV3Theme(options = {}) {
  const cssVariables = ref({});
  const element = computed(() => {
    if (!isClient()) return undefined;
    const el = typeof options.element === 'function' ? options.element() : null;
    return el || document.body;
  });

  function generateCSS() {
    if (!isClient() || !element.value) return;

    const computedStyle = window.getComputedStyle(element.value);
    const variables = {};

    for (const schema of SHADCN_SCHEMAS) {
      const name = `--${schema}`;
      const value = computedStyle.getPropertyValue(name).trim();

      if (value && !reg.test(value)) variables[name] = `hsl(${value})`;
    }

    cssVariables.value = Object.keys(variables).length > 0 ? variables : {};
  }

  generateCSS();

  useMutationObserver(
    () => (element.value ? [element.value, document.documentElement] : []),
    () => generateCSS(),
    {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: false,
    }
  );

  return {
    element,
    cssVariables,
    generateCSS,
    stop: () => {},
  };
}
