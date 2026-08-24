import { localeMessages } from '../locales';

export function useI18n() {
  function getI18nText(key) {
    try {
      const messages = localeMessages.value;
      if (!messages) return key;

      const result = key.split('.').reduce((obj, k) => {
        if (obj && typeof obj === 'object' && k in obj) return obj[k];
        return undefined;
      }, messages);

      return typeof result === 'string' ? result : key;
    } catch {
      return key;
    }
  }

  return { t: getI18nText };
}
