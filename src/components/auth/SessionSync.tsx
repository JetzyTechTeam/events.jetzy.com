import { useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useAppDispatch } from '@Jetzy/redux/stores';
import { LOGIN } from '@Jetzy/redux/reducers/appSlice';

export default function SessionSync() {
    const { data: session, status } = useSession();
    const dispatch = useAppDispatch();

    useEffect(() => {
        console.log('SessionSync: status:', status, 'session exists:', !!session);

        if (status === 'authenticated' && session) {
            // @ts-ignore
            const accessToken = session.accessToken || session.user?.accessToken;
            console.log('SessionSync: accessToken found:', accessToken ? 'YES (masked)' : 'NO');

            // Store token in sessionStorage for API calls - do this immediately and synchronously
            if (accessToken) {
                try {
                    sessionStorage.setItem('api_token', accessToken);
                    console.log('SessionSync: ✅ Stored token in sessionStorage');
                    console.log('SessionSync: Token length:', accessToken.length);
                } catch (err) {
                    console.error('SessionSync: ❌ Failed to store token:', err);
                }
            } else {
                // No token in session - this happens for old sessions after deployment
                sessionStorage.removeItem('api_token');
                console.warn('SessionSync: ⚠️ No token in session');

                // Sign out user and redirect to login to get fresh session with token
                // Only do this on interest group pages (not dashboard/console)
                if (typeof window !== 'undefined' && window.location.pathname.includes('/interests/')) {
                    const currentPath = window.location.pathname + window.location.search;
                    console.warn('SessionSync: 🔄 Signing out and redirecting to login...');
                    signOut({
                        callbackUrl: `/login?_cb=${encodeURIComponent(currentPath)}`,
                        redirect: true
                    });
                    return; // Exit early, don't dispatch LOGIN
                }
            }

            // Dispatch LOGIN to Redux store
            dispatch(LOGIN({
                user: session.user,
                accessToken: accessToken || ''
            }));

            if (accessToken) {
                console.log('SessionSync: ✅ Dispatched LOGIN with token to Redux');
            } else {
                console.warn('SessionSync: ⚠️ Dispatched LOGIN WITHOUT external token');
            }
        } else if (status === 'unauthenticated') {
            console.log('SessionSync: User is unauthenticated');
            sessionStorage.removeItem('api_token');
        }
    }, [session, status, dispatch]);

    return null;
}
