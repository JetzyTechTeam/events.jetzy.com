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

            if (accessToken) {
                console.log('SessionSync: Dispatching LOGIN with token');
                dispatch(LOGIN({
                    user: session.user,
                    accessToken: accessToken
                }));
            }
        }
    }, [session, status, dispatch]);

    return null;
}
