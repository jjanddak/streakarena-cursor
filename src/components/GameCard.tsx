'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { motion } from 'framer-motion';

type GameCardProps = {
  name: string;
  slug: string;
  waitingCount: number;
  emoji?: string;
};

export function GameCard({ name, slug, waitingCount, emoji = '🎮' }: GameCardProps) {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative overflow-hidden rounded-2xl glass glass-hover glow-border"
    >
      <div className="relative p-6">
        {/* Subtle glow */}
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl transition-all group-hover:bg-brand-500/20" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{emoji}</span>
            <div>
              <h3 className="text-lg font-semibold text-white">{name}</h3>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                <span className="text-xs text-white/50">
                  {t('waitingCount', { count: waitingCount })}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <Link
              href={`/game/${slug}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-brand-500/40 hover:brightness-110"
            >
              {tCommon('play')}
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
