/* API base: build-time env wins, localhost default for `pnpm dev`.
   No per-browser setup — Vercel bakes VITE_API_URL per environment. */
export const BASE_URL = (
  import.meta.env.VITE_API_URL as string | undefined
)?.replace(/\/$/, '');

const resolvedBase = BASE_URL || 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const token = localStorage.getItem('ce_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${resolvedBase}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 401) {
    localStorage.removeItem('ce_token');
    window.location.href = '/';
    throw new ApiError('Session expired — please log in again.', 401);
  }
  const payload = (await res.json().catch(() => ({}))) as {
    data?: T;
    message?: string | string[];
  };
  if (!res.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return payload.data as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function post<T>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  return request<T>('POST', path, body, extraHeaders);
}

export function apiBase(): string {
  return resolvedBase;
}
