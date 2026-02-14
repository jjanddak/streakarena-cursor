import { getRequestConfig } from 'next-intl/server';
import { routing } from './i18n/routing';

function isValidLocale(locale: string): boolean {
  return (routing.locales as readonly string[]).includes(locale);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && isValidLocale(requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
