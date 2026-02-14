import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('admin');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/60">{t('noPending')}</p>
      </div>
    </div>
  );
}
