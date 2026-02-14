'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

type GameRequestRow = {
  id: string;
  title: string;
  description: string | null;
  html_file_url: string | null;
  submitted_by: string | null;
  created_at: string;
  status: string;
};

type FetchState = 'idle' | 'loading' | 'unauthorized' | 'error' | 'ok';

function getAuthHeader(secret: string | null): Record<string, string> {
  if (!secret?.trim()) return {};
  return { 'x-admin-secret': secret.trim() };
}

export function AdminGameRequests() {
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');
  const [requests, setRequests] = useState<GameRequestRow[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [adminSecret, setAdminSecret] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchRequests = useCallback(
    async (secret: string | null = null) => {
      const headers = getAuthHeader(secret ?? adminSecret);
      setFetchState('loading');
      try {
        const res = await fetch('/api/admin/game-requests?status=pending', { headers });
        if (res.status === 401) {
          setFetchState('unauthorized');
          setRequests([]);
          return;
        }
        if (!res.ok) {
          setFetchState('error');
          setRequests([]);
          return;
        }
        const data = await res.json();
        setRequests(data.requests ?? []);
        setFetchState('ok');
      } catch {
        setFetchState('error');
        setRequests([]);
      }
    },
    [adminSecret]
  );

  useEffect(() => {
    fetchRequests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- initial load only

  async function handleApproveReject(id: string, action: 'approve' | 'reject') {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getAuthHeader(adminSecret),
    };
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/game-requests/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action }),
      });
      if (res.status === 401) {
        setFetchState('unauthorized');
        return;
      }
      if (res.ok) {
        await fetchRequests();
      }
    } finally {
      setActingId(null);
    }
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const s = secretInput.trim();
    setAdminSecret(s);
    fetchRequests(s);
  }

  if (fetchState === 'unauthorized') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="mb-4 text-white/80">{t('unauthorized')}</p>
        <form onSubmit={handleUnlock} className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Admin secret"
            className="rounded border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40"
          />
          <button
            type="submit"
            className="rounded bg-white/20 px-3 py-2 text-white hover:bg-white/30"
          >
            {t('unlock')}
          </button>
        </form>
      </div>
    );
  }

  if (fetchState === 'loading') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/60">{tCommon('loading')}</p>
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/60">{tCommon('error')}</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <p className="text-white/60">{t('noPending')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-white/80">
            <th className="p-3 font-medium">{t('requestTitle')}</th>
            <th className="p-3 font-medium">{t('requestDescription')}</th>
            <th className="p-3 font-medium">{t('requestUrl')}</th>
            <th className="p-3 font-medium">{t('requestDate')}</th>
            <th className="p-3 font-medium">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} className="border-b border-white/5 text-white/90">
              <td className="p-3">{r.title}</td>
              <td className="max-w-[200px] truncate p-3 text-white/70">
                {r.description || '—'}
              </td>
              <td className="p-3">
                {r.html_file_url ? (
                  <a
                    href={r.html_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-300 underline"
                  >
                    {t('link')}
                  </a>
                ) : (
                  '—'
                )}
              </td>
              <td className="whitespace-nowrap p-3 text-white/60">
                {new Date(r.created_at).toLocaleDateString()}
              </td>
              <td className="p-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproveReject(r.id, 'approve')}
                    disabled={actingId === r.id}
                    className="rounded bg-green-600/80 px-2 py-1 text-white hover:bg-green-600 disabled:opacity-50"
                  >
                    {t('approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveReject(r.id, 'reject')}
                    disabled={actingId === r.id}
                    className="rounded bg-red-600/80 px-2 py-1 text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {t('reject')}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
