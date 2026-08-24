import { computed, onMounted, ref, unref, watch } from '@vue/composition-api';
import { isClient } from '../utils';
import { useMutationObserver } from './use-mutation-observer';

export function useDarkDetector(darkProp) {
  const target = ref(null);

  const isDarkProvided = computed(() => typeof unref(darkProp) === 'boolean');
  const detectedDark = ref(false);
  const isDark = computed(() => (isDarkProvided.value ? unref(darkProp) : detectedDark.value));

  function detect() {
    if (isClient()) detectedDark.value = document.documentElement.classList.contains('dark');
  }

  useMutationObserver(target, () => detect(), {
    attributes: true,
    attributeFilter: ['class'],
  });

  watch(isDarkProvided, (value) => {
    if (value) target.value = null;
  });

  onMounted(() => {
    if (!isDarkProvided.value) {
      detect();
      target.value = document.documentElement;
    }
  });

  return { isDark, isDarkProvided, stop: () => {} };
}
