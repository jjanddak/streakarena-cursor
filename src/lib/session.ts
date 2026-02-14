import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

const COOKIE_NAME = 'sa_session_id';

/**
 * Get the session ID from cookies. Creates one if it doesn't exist.
 * Must be called in a Server Component or Route Handler.
 */
export async function getSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME);
  if (existing?.value) {
    return existing.value;
  }
  // Generate new session ID
  const sessionId = uuidv4();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: '/',
  });
  return sessionId;
}

/**
 * Read-only: get session ID if it exists.
 */
export async function getSessionIdIfExists(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}
