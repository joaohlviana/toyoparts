import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  CUSTOMER_ORDERS_PATH,
} from '../../lib/customer-auth';
import { getValidatedCustomerSession } from '../../lib/customer-session';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCallbackParam(name: string, url: URL, hashParams: URLSearchParams) {
  return url.searchParams.get(name) || hashParams.get(name) || '';
}

function formatAuthError(raw: string) {
  const message = decodeURIComponent(raw || '').replace(/\+/g, ' ').trim();
  if (!message) return 'Nao foi possivel validar este link de acesso.';
  if (/expired|otp_expired|token.*expired/i.test(message)) {
    return 'Este link expirou. Solicite um novo acesso para continuar.';
  }
  if (/used|already|invalid grant|token.*used/i.test(message)) {
    return 'Este link ja foi utilizado. Gere um novo e-mail de acesso.';
  }
  if (/redirect|domain|allow.?list|site url/i.test(message)) {
    return 'O link foi gerado com um redirecionamento invalido. Solicite um novo acesso.';
  }
  if (/signup/i.test(message)) {
    return 'Este link foi emitido no fluxo errado. Solicite um novo magic link de acesso.';
  }
  return message;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [statusMessage, setStatusMessage] = useState('Validando seu acesso...');
  const [errorMessage, setErrorMessage] = useState('');
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) {
      return undefined;
    }

    hasStartedRef.current = true;
    let cancelled = false;

    const handleAuthCallback = async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));

        const directError = readCallbackParam('error_description', currentUrl, hashParams)
          || readCallbackParam('error', currentUrl, hashParams);

        setStatusMessage('Concluindo login...');
        let session = null;
        let sessionError: Error | null = null;

        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            if (cancelled) return;
            setStatusMessage(attempt === 0 ? 'Confirmando sua sessao...' : 'Finalizando seu acesso...');
            session = await getValidatedCustomerSession();
            if (session?.user) {
              break;
            }
          } catch (error: any) {
            sessionError = error;
          }
          if (cancelled) return;
          await sleep(250);
        }

        if (directError && !session?.user) {
          throw new Error(formatAuthError(directError));
        }

        if (!session?.user) {
          throw sessionError || new Error('Este link expirou, ja foi usado ou nao pode mais ser validado.');
        }

        if (cancelled) return;
        toast.success('Login realizado com sucesso!');
        navigate(CUSTOMER_ORDERS_PATH, { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        const friendlyMessage = formatAuthError(e?.message || '');
        console.error('Auth callback error:', e);
        setErrorMessage(friendlyMessage);
        toast.error(friendlyMessage);
        setTimeout(() => {
          navigate('/acesso', { replace: true });
        }, 2200);
      }
    };

    handleAuthCallback();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        {errorMessage ? (
          <>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">Nao foi possivel concluir seu acesso</h2>
            <p className="text-sm text-muted-foreground leading-6">{errorMessage}</p>
            <p className="mt-3 text-xs text-muted-foreground">Voce sera redirecionado para solicitar um novo link.</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-5 h-8 w-8 animate-spin text-primary" />
            <h2 className="mb-2 text-xl font-semibold text-foreground">Verificando acesso...</h2>
            <p className="text-sm text-muted-foreground">{statusMessage}</p>
          </>
        )}
      </div>
    </div>
  );
}
