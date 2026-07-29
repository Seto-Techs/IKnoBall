import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authClient } from './auth';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: AuthUser;
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  };
}

/* ---------- mock data ---------- */

const MOCK_USER: AuthUser = {
  id: 'mock-admin-1',
  name: 'Admin',
  email: 'admin@iknoball.dev',
  emailVerified: true,
  image: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_SESSION: AuthSession = {
  user: MOCK_USER,
  session: {
    id: 'mock-session-1',
    userId: MOCK_USER.id,
    token: 'mock-token',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ipAddress: null,
    userAgent: null,
  },
};

const isMock = () => import.meta.env.VITE_MOCK_AUTH === 'true';

/* ---------- hooks ---------- */

export function useSession() {
  return useQuery<AuthSession | null>({
    queryKey: ['session'],
    queryFn: async () => {
      if (isMock()) return null; // start logged out; session set via signIn
      try {
        const { data } = (await authClient.getSession()) as {
          data: AuthSession | null;
        };
        return data;
      } catch {
        return null;
      }
    },
    staleTime: isMock() ? Infinity : 1000 * 60 * 5,
    retry: false,
  });
}

export function useSignIn() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      if (isMock()) return { token: 'mock-token', user: MOCK_USER };

      const { data, error } = await authClient.signIn.email({
        email,
        password,
      });
      if (error) throw new Error(error.message ?? error.code ?? 'Sign in failed');
      return data as { token: string; user: AuthUser };
    },
    onSuccess: () => {
      qc.setQueryData(['session'], MOCK_SESSION);
    },
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }) => {
      if (isMock()) return { user: { ...MOCK_USER, name } };

      const { data, error } = await authClient.signUp.email({
        name,
        email,
        password,
      });
      if (error) throw new Error(error.message ?? error.code ?? 'Sign up failed');
      return data as { user: AuthUser };
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (isMock()) return;

      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? error.code ?? 'Sign out failed');
    },
    onSuccess: () => {
      qc.setQueryData(['session'], null);
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
}
