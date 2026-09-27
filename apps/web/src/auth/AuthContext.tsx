import { useCallback, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../api/client';
import { AuthContext, type AuthPayload } from './auth-context';

const TOKEN_KEY = 'ce_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const navigate = useNavigate();

  const store = useCallback(
    (payload: AuthPayload) => {
      localStorage.setItem(TOKEN_KEY, payload.accessToken);
      setTokenState(payload.accessToken);
      navigate('/dashboard');
    },
    [navigate],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      store(await post<AuthPayload>('/auth/login', { email, password }));
    },
    [store],
  );

  const register = useCallback(
    async (email: string, password: string, workspaceName: string) => {
      store(
        await post<AuthPayload>('/auth/register', {
          email,
          password,
          workspaceName,
        }),
      );
    },
    [store],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setTokenState(null);
    navigate('/');
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
