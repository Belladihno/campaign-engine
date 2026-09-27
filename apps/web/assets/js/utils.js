/* Shared helpers: toast, redirect, formatting, token storage. */

const TOKEN_KEY = 'ce_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  redirect('index.html');
}

export function requireAuth() {
  const token = getToken();
  if (!token) {
    redirect('index.html');
    return null;
  }
  return token;
}

export function redirect(path) {
  window.location.href = path;
}

export function showToast(message, type = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : ''}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

export function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPhone(phone) {
  return phone || '—';
}

export function statusBadgeClass(status) {
  const map = {
    PENDING: 'badge-pending',
    PROCESSING: 'badge-processing',
    SENT: 'badge-sent',
    PARTIALLY_SENT: 'badge-partially-sent',
    FAILED: 'badge-failed',
    QUEUED: 'badge-queued',
    DELIVERED: 'badge-delivered',
  };
  // SENT means different things per context: provider-accepted contact
  // (blue) vs finished campaign (green). Caller overrides when needed.
  return map[status] || 'badge-muted';
}

export function contactBadgeClass(status) {
  if (status === 'SENT') return 'badge-contact-sent';
  return statusBadgeClass(status);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
