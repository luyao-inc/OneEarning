import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCommon from '@/locales/zh-CN/common.json';
import enCommon from '@/locales/en/common.json';

export type UiLocale = 'zh-CN' | 'en';

const STORAGE_KEY = 'oneearning.locale';

function readStoredLocale(): UiLocale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'zh-CN') return v;
  } catch {
    /* ignore */
  }
  return 'zh-CN';
}

void i18n.use(initReactI18next).init({
  lng: readStoredLocale(),
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': { common: zhCommon },
    en: { common: enCommon },
  },
  defaultNS: 'common',
  ns: ['common'],
  interpolation: { escapeValue: false },
});

export function setUiLocale(next: UiLocale): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  void i18n.changeLanguage(next);
}

export default i18n;
