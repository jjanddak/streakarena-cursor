import { setRequestLocale, getTranslations } from 'next-intl/server';

type Props = { params: Promise<{ locale: string }> };

export default async function SubmitPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('submit');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
      <p className="mt-2 text-white/60">{t('description')}</p>
      <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/60">게임 제출 폼은 다음 단계에서 구현됩니다.</p>
      </div>
    </div>
  );
}
