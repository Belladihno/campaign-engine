/* All fetch calls. Injects the JWT, unwraps { data }, redirects on 401. */
import { getToken, clearToken } from './utils.js';

export const BASE_URL = 'http://localhost:3000/api/v1';

async function request(method, path, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.status === 401) {
    clearToken();
    throw new Error('Session expired — please log in again.');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return payload.data;
}

export function get(path) {
  return request('GET', path);
}

export function post(path, body, extraHeaders) {
  return request('POST', path, body, extraHeaders);
}
