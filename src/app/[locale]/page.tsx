import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-2 text-neutral-400">{t('subtitle')}</p>
    </main>
  );
}
