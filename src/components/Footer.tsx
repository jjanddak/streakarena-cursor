'use client';

import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-white/[0.06] bg-[#050510]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-purple-500 text-xs font-bold text-white">
              S
            </div>
            <span className="text-sm font-semibold text-white/70">StreakArena</span>
          </div>
          <p className="text-xs text-white/30">{t('copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
