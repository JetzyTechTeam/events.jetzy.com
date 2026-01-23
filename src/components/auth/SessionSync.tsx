import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
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

            // Always dispatch LOGIN to store user data, even if token is missing
            // The token might be fetched later or might not be needed for all APIs
            dispatch(LOGIN({
                user: session.user,
                accessToken: accessToken || '' // Use empty string if no token
            }));

            if (accessToken) {
                console.log('SessionSync: Dispatched LOGIN with token');
            } else {
                console.warn('SessionSync: Dispatched LOGIN WITHOUT external token - some API calls may fail');
                console.warn('SessionSync: User may need to re-login to fetch external token');
            }
        }
    }, [session, status, dispatch]);

    return null;
}
