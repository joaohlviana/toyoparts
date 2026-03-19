import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { supabase } from '../../../lib/supabase';
import { toast } from 'sonner';

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Process the hash fragment from the URL which contains the access_token
    const handleAuthCallback = async () => {
      try {
        const { error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        // Successfully authenticated
        toast.success('Login realizado com sucesso!');
        navigate('/minha-conta/pedidos');
      } catch (e: any) {
        console.error('Auth callback error:', e);
        toast.error('Erro ao processar login: ' + e.message);
        navigate('/acesso'); // Redirect back to login on error
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Verificando acesso...</h2>
        <p className="text-muted-foreground text-sm">Aguarde um momento.</p>
      </div>
    </div>
  );
}