import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient } from './auth';

/**
 * The signed-in user's linked sign-in methods, straight from Better Auth.
 *
 * `credential` is email + password; `discord` carries the Discord user id in
 * `accountId`, which is what makes a profile deep link possible.
 */
export interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
  createdAt: string;
}

/**
 * Better Auth's client types declare timestamps as `Date`, but the wire carries
 * ISO strings (the query is plain `fetch` + JSON). Normalising here keeps every
 * consumer on one shape instead of sprinkling casts at call sites.
 */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

const isMock = () => import.meta.env.VITE_MOCK_AUTH === 'true';

/** Avatar uploads are capped well below the 2 MB a file picker allows. */
const AVATAR_SIZE = 160;

export function useAccounts(enabled = true) {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async (): Promise<LinkedAccount[]> => {
      if (isMock()) return [];
      const { data, error } = await authClient.listAccounts();
      if (error) throw new Error(error.message ?? 'Could not load your sign-in methods');
      return (data ?? []).map((account) => ({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
        createdAt: toIso(account.createdAt),
      }));
    },
    enabled,
    staleTime: 1000 * 60,
  });
}

export interface ActiveSession {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export function useSessions(enabled = true) {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<ActiveSession[]> => {
      if (isMock()) return [];
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message ?? 'Could not load your sessions');
      return (data ?? []).map((session) => ({
        id: session.id,
        token: session.token,
        createdAt: toIso(session.createdAt),
        expiresAt: toIso(session.expiresAt),
        ipAddress: session.ipAddress ?? null,
        userAgent: session.userAgent ?? null,
      }));
    },
    enabled,
    staleTime: 1000 * 30,
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (isMock()) return;
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message ?? 'Could not sign out your other sessions');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { name?: string; image?: string | null }) => {
      if (isMock()) return;
      const { error } = await authClient.updateUser(patch);
      if (error) throw new Error(error.message ?? 'Could not save your profile');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      if (isMock()) return;
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if (error) throw new Error(error.message ?? 'Could not change your password');
    },
  });
}

export function useLinkDiscord() {
  return useMutation({
    mutationFn: async (callbackURL: string) => {
      if (isMock()) return;
      const { data, error } = await authClient.linkSocial({ provider: 'discord', callbackURL });
      if (error) throw new Error(error.message ?? 'Could not start Discord linking');
      // Better Auth hands back the provider's authorise URL; following it is the
      // only way out of the SPA, exactly as `signInWithDiscord` does.
      if (data?.url) window.location.href = data.url;
    },
  });
}

export function useUnlinkAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (providerId: string) => {
      if (isMock()) return;
      const { error } = await authClient.unlinkAccount({ providerId });
      if (error) throw new Error(error.message ?? 'Could not disconnect that account');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

/**
 * Centre-crop a picked file to a square and re-encode it small enough to ride in
 * `users.image`.
 *
 * The avatar is stored inline as a data URL, which works against the live
 * `update-user` endpoint with no backend change. That is a stopgap: a data URL
 * travels in every `get-session` response. Move the file into S3 (`S3Service`
 * already exists) and store the URL once `AWS_BASE_URL` is configured.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image');

  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();

  return canvas.toDataURL('image/jpeg', 0.75);
}
