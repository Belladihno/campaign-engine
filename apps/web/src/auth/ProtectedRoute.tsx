import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
}
