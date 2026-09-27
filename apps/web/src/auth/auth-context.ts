import { createContext } from 'react';

export interface AuthPayload {
  user: { id: string; email: string };
  workspace: { id: string; name: string; credits: number };
  accessToken: string;
}

export interface AuthContextValue {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    workspaceName: string,
  ) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
