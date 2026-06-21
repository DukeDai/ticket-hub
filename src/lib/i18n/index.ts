/**
 * Server-side translation utility for next-intl
 *
 * Usage in Server Components / Route Handlers:
 *   import { getTranslations } from '@/lib/i18n';
 *   const t = await getTranslations();
 *   t('common.appName')  // → "票务中心" or "TicketHub"
 *
 * Usage with locale:
 *   import { getTranslations, setLocale } from '@/lib/i18n';
 *   const t = await getTranslations('en');
 */
import { getTranslations as nextIntlGetTranslations } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from './config';

/**
 * Get translations for the current locale (from request context)
 */
export async function getTranslations() {
  return nextIntlGetTranslations();
}

/**
 * Get translations for a specific locale
 * Useful in API routes or when locale is known
 */
export async function getTranslationsForLocale(locale: Locale) {
  return nextIntlGetTranslations(locale);
}

/**
 * Re-export types and config for convenience
 */
export { locales, defaultLocale };
export type { Locale } from './config';