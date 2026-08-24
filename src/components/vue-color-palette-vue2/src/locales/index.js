import { ref } from '@vue/composition-api';

export const SUPPORT_LANGUAGES = ['en-US', 'zh-CN'];

const enUS = {
  button: {
    monochrome: 'Solid',
    'linear-gradient': 'Linear',
    'radial-gradient': 'Radial',
  },
  gradient: {
    angle: 'Angle',
    'position-x': 'X',
    'position-y': 'Y',
    percentage: 'Percentage',
  },
  text: {
    'swatch-colors': 'Swatch Colors',
    'recent-colors': 'Recent Colors',
    copied: 'Copied',
  },
};

const zhCN = {
  button: {
    monochrome: '单色',
    'linear-gradient': '线性渐变',
    'radial-gradient': '径向渐变',
  },
  gradient: {
    angle: '角度',
    'position-x': '水平',
    'position-y': '垂直',
    percentage: '占比',
  },
  text: {
    'swatch-colors': '系统预设',
    'recent-colors': '最近使用',
    copied: '已复制',
  },
};

export const localeMessagesData = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

export const localeMessages = ref();

export const currentLocale = ref('en-US');

export const localeLoaded = ref(false);

export async function loadLocaleMessages(language) {
  try {
    if (typeof language === 'string') {
      localeMessages.value = localeMessagesData[language] || localeMessagesData['en-US'];
      currentLocale.value = language;
    } else {
      localeMessages.value = language;
    }
  } catch {
    localeMessages.value = localeMessagesData['en-US'];
  } finally {
    // 无论成功还是失败，都标记为已加载
    localeLoaded.value = true;
  }
}

loadLocaleMessages('en-US');
