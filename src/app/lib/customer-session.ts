import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

type SessionResolutionOptions = {
  forceRefresh?: boolean;
};

const CUSTOMER_AUTH_STORAGE_KEY = `sb-${projectId}-auth-token`;
const CUSTOMER_AUTH_STORAGE_KEYS = [
  CUSTOMER_AUTH_STORAGE_KEY,
  `${CUSTOMER_AUTH_STORAGE_KEY}-code-verifier`,
  `${CUSTOMER_AUTH_STORAGE_KEY}-user`,
];

function removeCustomerAuthStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (const key of CUSTOMER_AUTH_STORAGE_KEYS) {
        storage.removeItem(key);
      }
    } catch {
      // Storage access is best-effort only.
    }
  }
}

function isRetryableAuthError(error: any) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const status = Number(error?.status || 0);

  return (
    name === 'AuthRetryableFetchError'
    || status >= 500
    || /failed to fetch|network|timed out|timeout|connection|gateway|cloudflare|522|530/i.test(message)
  );
}

function shouldDiscardPersistedSession(error: any) {
  if (!error || isRetryableAuthError(error)) {
    return false;
  }

  const name = String(error?.name || '');
  const message = String(error?.message || '');
  const status = Number(error?.status || 0);

  return (
    name === 'AuthSessionMissingError'
    || status === 400
    || status === 401
    || status === 403
    || status === 404
    || /invalid|expired|used|already|refresh token|jwt|session.*(missing|not found)|token.*(missing|not found)|otp/i.test(message)
  );
}

async function discardPersistedCustomerSession() {
  removeCustomerAuthStorage();

  const authClient = supabase.auth as any;
  if (typeof authClient?._removeSession === 'function') {
    try {
      await authClient._removeSession();
      return;
    } catch {
      // Fallback to storage cleanup only.
    }
  }
}

async function discardPersistedCustomerSessionIfNeeded(error: any) {
  if (shouldDiscardPersistedSession(error)) {
    await discardPersistedCustomerSession();
  }
}

function readAuthParamsFromCurrentUrl() {
  if (typeof window === 'undefined') {
    return {
      code: '',
      accessToken: '',
      refreshToken: '',
      loginToken: '',
      tokenHash: '',
      otpType: '',
    };
  }

  const currentUrl = new URL(window.location.href);
  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));

  return {
    code: currentUrl.searchParams.get('code') || '',
    accessToken:
      currentUrl.searchParams.get('access_token')
      || hashParams.get('access_token')
      || '',
    refreshToken:
      currentUrl.searchParams.get('refresh_token')
      || hashParams.get('refresh_token')
      || '',
    loginToken:
      currentUrl.searchParams.get('login_token')
      || hashParams.get('login_token')
      || '',
    tokenHash:
      currentUrl.searchParams.get('token_hash')
      || hashParams.get('token_hash')
      || '',
    otpType:
      currentUrl.searchParams.get('type')
      || hashParams.get('type')
      || '',
  };
}

async function bootstrapSessionFromUrl() {
  const { code, accessToken, refreshToken, loginToken, tokenHash, otpType } = readAuthParamsFromCurrentUrl();

  let resolvedTokenHash = tokenHash;
  let resolvedOtpType = otpType;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw error;
    }
    return true;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      throw error;
    }
    return true;
  }

  if (loginToken && !resolvedTokenHash) {
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0/resend/magic-link/consume`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
          apikey: publicAnonKey,
        },
        body: JSON.stringify({ token: loginToken }),
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token_hash) {
      throw new Error(data?.error || 'Nao foi possivel validar este link de acesso.');
    }

    resolvedTokenHash = String(data.token_hash || '');
    resolvedOtpType = String(data.type || resolvedOtpType || 'magiclink');
  }

  if (resolvedTokenHash) {
    const candidateTypes = Array.from(
      new Set(
        [
          resolvedOtpType,
          resolvedOtpType === 'magiclink' ? 'email' : '',
          resolvedOtpType === 'email' ? 'magiclink' : '',
          'magiclink',
          'email',
        ].filter(Boolean),
      ),
    );

    let lastError: Error | null = null;
    for (const type of candidateTypes) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: resolvedTokenHash,
        type: type as 'magiclink' | 'email',
      });

      if (!error) {
        return true;
      }

      lastError = error;
      if (!/invalid|expired|used|token|otp/i.test(error.message || '')) {
        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  return false;
}

export async function getValidatedCustomerSession(
  options: SessionResolutionOptions = {},
) {
  const { forceRefresh = false } = options;

  let bootstrapAttempted = false;
  let bootstrapError: Error | null = null;
  try {
    bootstrapAttempted = await bootstrapSessionFromUrl();
  } catch (error: any) {
    bootstrapAttempted = true;
    bootstrapError = error;
  }

  if (forceRefresh) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    await discardPersistedCustomerSessionIfNeeded(refreshError);
  }

  // Force Supabase to validate/refresh the current user before we trust the token.
  const { error: userError } = await supabase.auth.getUser();
  await discardPersistedCustomerSessionIfNeeded(bootstrapError);
  await discardPersistedCustomerSessionIfNeeded(userError);
  if (userError && !bootstrapAttempted && !forceRefresh) {
    const didBootstrap = await bootstrapSessionFromUrl();
    if (didBootstrap) {
      const retryUser = await supabase.auth.getUser();
      await discardPersistedCustomerSessionIfNeeded(retryUser.error);
      if (retryUser.error) {
        throw bootstrapError || retryUser.error;
      }
    } else {
      throw bootstrapError || userError;
    }
  } else if (userError) {
    throw bootstrapError || userError;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session ?? null;
}

export async function clearCustomerSession() {
  await discardPersistedCustomerSession();
}
