'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type SubmitResult = 'idle' | 'success' | 'error';

export function SubmitGameForm() {
  const t = useTranslations('submit');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [htmlFileUrl, setHtmlFileUrl] = useState('');
  const [status, setStatus] = useState<SubmitResult>('idle');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setStatus('idle');

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/game-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || undefined,
          html_file_url: htmlFileUrl.trim() || undefined,
        }),
      });

      if (res.ok) {
        setTitle('');
        setDescription('');
        setHtmlFileUrl('');
        setStatus('success');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium text-white/80">
          {t('formTitle')}
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          placeholder={t('formTitlePlaceholder')}
        />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium text-white/80">
          {t('formDescription')}
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          placeholder={t('formDescriptionPlaceholder')}
        />
      </div>
      <div>
        <label htmlFor="htmlFileUrl" className="mb-1 block text-sm font-medium text-white/80">
          {t('htmlFile')}
        </label>
        <input
          id="htmlFileUrl"
          type="url"
          value={htmlFileUrl}
          onChange={(e) => setHtmlFileUrl(e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
          placeholder={t('htmlFileUrlPlaceholder')}
        />
      </div>

      {status === 'success' && (
        <p className="rounded-lg bg-green-500/20 px-3 py-2 text-sm text-green-300">
          {t('submitSuccess')}
        </p>
      )}
      {status === 'error' && (
        <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300">
          {t('submitError')}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-white/20 px-4 py-2 font-medium text-white transition hover:bg-white/30 disabled:opacity-50"
      >
        {submitting ? tCommon('loading') : tCommon('submit')}
      </button>
    </form>
  );
}
