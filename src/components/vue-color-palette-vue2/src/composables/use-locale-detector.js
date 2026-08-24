import { computed, onMounted, ref, unref } from '@vue/composition-api';
import { SUPPORT_LANGUAGES } from '../locales';
import { isClient } from '../utils';
import { useNavigatorLanguage } from './use-navigator-language';

export function useLocaleDetector(localeProp) {
  const { language } = useNavigatorLanguage();
  const isLocaleConfig = computed(() => typeof unref(localeProp) === 'object');
  const htmlLang = ref();

  const locale = computed(() => {
    const data = unref(localeProp);
    if (isLocaleConfig.value) return data;
    const matched = SUPPORT_LANGUAGES.find((l) => l === data);
    if (matched) return matched;
    const lang = (htmlLang.value || language.value || '').toLowerCase();
    return ['zh', 'zh-cn', 'zh-tw'].includes(lang) ? 'zh-CN' : 'en-US';
  });

  onMounted(() => {
    if (isClient()) htmlLang.value = document.documentElement.lang;
  });

  return { locale };
}
