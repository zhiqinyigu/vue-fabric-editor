import { onBeforeUnmount, onMounted, ref } from '@vue/composition-api';
import { isClient } from '../utils';

export function useNavigatorLanguage() {
  const language = ref(isClient() && navigator.language ? navigator.language : undefined);

  function update() {
    if (isClient() && navigator.language) language.value = navigator.language;
  }

  if (isClient()) {
    onMounted(() => {
      if (typeof window.addEventListener === 'function')
        window.addEventListener('languagechange', update);
    });
    onBeforeUnmount(() => {
      if (typeof window.removeEventListener === 'function')
        window.removeEventListener('languagechange', update);
    });
  }

  return { language };
}
