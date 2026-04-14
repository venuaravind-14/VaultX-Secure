import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      const token = searchParams.get('token');

      if (!token) {
        toast.error('Authentication failed: No token received.');
        navigate('/login');
        return;
      }

      try {
        // Use the token to fetch the user profile
        // The token is temporarily in the URL, but we'll store it properly in the store
        const res = await api.get('/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.data?.success) {
          const user = res.data.data.user;
          
          // 1. Save to state (Zustand)
          setAuth(user, token);
          
          // 2. Immediate feedback
          toast.success(`Welcome, ${user.name.split(' ')[0]}!`);
          
          // 3. Move to dashboard — state update is synchronous in Zustand, 
          // so by the time "/" renders, everything is ready.
          navigate('/', { replace: true });
        } else {
          throw new Error('Failed to fetch user profile');
        }
      } catch (err) {
        console.error('OAuth Callback Error:', err);
        toast.error(err.response?.data?.message || 'Authentication failed. Please try again.');
        navigate('/login');
      }
    };

    handleCallback();
  }, [searchParams, navigate, setAuth]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="text-center">
        <Loader2 size={48} className="animate-spin text-primary-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Finalizing Secure Session</h2>
        <p className="text-slate-500 dark:text-slate-400">Verifying your identity with Google...</p>
      </div>
    </div>
  );
}
