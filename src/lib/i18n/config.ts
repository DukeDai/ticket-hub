/**
 * i18n 配置
 * supportedLocales:  支持的语言列表
 * defaultLocale:     默认语言（未匹配到时使用）
 */
export const locales = ['zh-CN', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'zh-CN';

/**
 * 将语言标签映射到 display name
 */
export const localeNames: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};