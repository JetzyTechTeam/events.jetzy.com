import React, { useEffect, useState } from 'react'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { authorizedOnly } from '@Jetzy/lib/authSession'
import {
    GetInterestDetailsApi,
    JoinInterestApi,
    RemoveMemberApi,
    GetInterestFeedApi,
    GetInterestMembersApi,
    CreatePostApi,
    DeletePostApi,
    LikePostApi,
    CreateCommentApi,
    ReactToCommentApi,
    UpdateCommentApi,
    GetPostCommentsApi,
    GetJoinRequestsApi,
    JoinRequestActionApi,
    DeleteInterestGroupApi
} from '@Jetzy/services/interests/interestsapis'
import InterestGroupHeader from '@Jetzy/components/interests/InterestGroupHeader'
import InterestFeed from '@Jetzy/components/interests/InterestFeed'
import InterestMembers from '@Jetzy/components/interests/InterestMembers'
import Spinner from '@Jetzy/components/misc/Spinner'
import { Error as ErrorToast, Success } from '@Jetzy/lib/_toaster'
import { CheckIcon, XMarkIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/solid'
import PeopleWidget from '@Jetzy/components/users/PeopleWidget'
import { useAppSelector } from '@Jetzy/redux/stores'
import { getAuthUser } from '@Jetzy/redux/reducers/appSlice'
import { useSession } from 'next-auth/react'

export default function InterestGroupPage() {
    const router = useRouter()
    const { interestId } = router.query
    const [loading, setLoading] = useState(true)
    const [interest, setInterest] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'requests'>('feed')

    // Client-side authentication check
    const { data: session, status } = useSession()

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            const currentPath = router.asPath
            router.push(`/login?_cb=${encodeURIComponent(currentPath)}`)
        }
    }, [status, router])

    // Use Redux store user instead of local state - this updates when session changes
    const currentUser = useAppSelector(getAuthUser)

    // FIX: Backend returns isAdmin: true for all users, so we need to check manually
    // Check if current user is the creator or has admin role in membership
    const isAdmin = React.useMemo(() => {
        if (!interest || !currentUser) return false;

        // Get creator ID from various possible locations
        const { interestId: paramsId } = router.query
        const mongoId = interest?._id || interest?.id || (paramsId as string);
        const creatorId = interest.userId || interest.owner || interest.creator?._id || interest.creator?.id || interest.creator || interest.user?._id || interest.user?.id || interest.user;
        const currentUserId = currentUser._id || currentUser.id;

        // Check if user is creator
        const isCreator = String(creatorId) === String(currentUserId);

        // Check if user has admin/creator role in membership
        const hasAdminRole = interest?.currentUserMembership?.role === 'admin' || interest?.currentUserMembership?.role === 'creator';

        // Check if user is a global admin
        const isGlobalAdmin = currentUser?.role === 'admin';

        return isCreator || hasAdminRole || isGlobalAdmin;
    }, [interest, currentUser]);

    // Feed State
    const [posts, setPosts] = useState<any[]>([])
    const [loadingFeed, setLoadingFeed] = useState(false)

    // Members State
    const [members, setMembers] = useState<any[]>([])
    const [loadingMembers, setLoadingMembers] = useState(false)

    // Lock membership state for a few seconds after an action to prevent flickering from slow DB sync
    const [membershipAction, setMembershipAction] = useState<{ status: boolean; ts: number } | null>(null);

    // Check if current user is member
    // Check if current user is member
    const isMember = React.useMemo(() => {
        // If we recently performed a join/leave, lock the UI to that state for 10 seconds
        if (membershipAction && (Date.now() - membershipAction.ts < 10000)) {
            console.log('🔒 Membership Locked:', membershipAction.status);
            return membershipAction.status;
        }

        if (!currentUser) {
            console.log('👤 isMember: No Current User');
            return false;
        }

        const currentUserId = currentUser._id || currentUser.id;
        const currentEmail = currentUser.email?.toLowerCase();

        // Check if user is in the members list
        const inMembersList = members.some(m => {
            const memberId = m.user?._id || m.user?.id || m.userDetails?._id || m.userDetails?.id || m._id;
            const memberEmail = (m.email || m.userDetails?.email || m.user?.email || m.user?.userDetails?.email)?.toLowerCase();

            const idMatch = String(memberId) === String(currentUserId);
            const emailMatch = (memberEmail && currentEmail && memberEmail === currentEmail);

            // Name fallback: sometimes IDs/Emails don't match or are hidden
            const mData = m.user || m.userDetails || m;
            const mFirstName = (mData.firstName || '').trim().toLowerCase();
            const mLastName = (mData.lastName || '').trim().toLowerCase();
            const mFullName = (mData.fullName || `${mFirstName} ${mLastName}`).trim().toLowerCase();

            const myFirstName = (currentUser.firstName || '').trim().toLowerCase();
            const myLastName = (currentUser.lastName || '').trim().toLowerCase();
            const myFullName = (currentUser.fullName || currentUser.name || `${myFirstName} ${myLastName}`).trim().toLowerCase();

            const nameMatch = (mFullName && myFullName && mFullName === myFullName);

            return idMatch || emailMatch || nameMatch;
        });

        const isMemberByInterest = interest?.isMember || interest?.currentUserMembership?.status === 'member';

        console.log('🔍 isMember Check:', {
            inMembersList,
            isMemberByInterest,
            membersCount: members.length,
            userId: currentUserId
        });

        // PRIORITY FIX: If we have members loaded, trust the list absolutely.
        // The `interest.isMember` flag from backend is often stale/cached.
        if (members.length > 0) {
            console.log('🔍 isMember: Trusting members list because it is loaded.');
            return inMembersList;
        }

        // Fallback only if members list is empty (not loaded yet)
        return inMembersList || isMemberByInterest || false;
    }, [interest, currentUser, members, membershipAction]);

    // Requests State (Admin only)
    const [requests, setRequests] = useState<any[]>([])
    const [loadingRequests, setLoadingRequests] = useState(false)

    // Track if we're waiting for authentication to complete
    const [waitingForAuth, setWaitingForAuth] = useState(true)

    // Wait for session to be authenticated and token to be stored
    useEffect(() => {
        if (status === 'authenticated' && session) {
            // Check if token is in sessionStorage
            const token = sessionStorage.getItem('api_token');

            if (token) {
                console.log('✅ Token found in sessionStorage, ready to make API calls');
                setWaitingForAuth(false);
            } else {
                console.log('⏳ Session authenticated but token not in sessionStorage yet, waiting...');
                // Wait a bit for SessionSync to store the token
                const checkTokenInterval = setInterval(() => {
                    const token = sessionStorage.getItem('api_token');
                    if (token) {
                        console.log('✅ Token now available in sessionStorage');
                        setWaitingForAuth(false);
                        clearInterval(checkTokenInterval);
                    }
                }, 100);

                // Timeout after 8 seconds (increased for JIT sync/slow DB)
                setTimeout(() => {
                    clearInterval(checkTokenInterval);
                    const token = sessionStorage.getItem('api_token');
                    if (!token) {
                        console.error('❌ Token still not available after 8 seconds');
                    } else {
                        console.log('✅ Token found at the last second of polling');
                    }
                    setWaitingForAuth(false);
                }, 8000);

                return () => clearInterval(checkTokenInterval);
            }
        }
    }, [status, session])

    // Clear lock when user changes
    useEffect(() => {
        setMembershipAction(null);
    }, [currentUser?._id]);

    useEffect(() => {
        if (interestId && !waitingForAuth) {
            fetchInterestDetails()
            fetchMembers()
        }
    }, [interestId, waitingForAuth])

    useEffect(() => {
        if (interestId && !waitingForAuth) {
            if (activeTab === 'feed') {
                fetchFeed()
                fetchMembers() // PeopleWidget needs member data
            }
            if (activeTab === 'members') fetchMembers()
            if (activeTab === 'requests') fetchRequests()
        }
    }, [interestId, activeTab, waitingForAuth])

    const handleRefresh = () => {
        if (activeTab === 'feed') {
            fetchFeed()
            fetchMembers()
        } else if (activeTab === 'members') {
            fetchMembers()
        } else if (activeTab === 'requests') {
            fetchRequests()
        }
    }


    // Debug interest object
    useEffect(() => {
        if (interest) {
            console.log('Interest Object Debug:', {
                creator: interest.creator,
                user: interest.user,
                fullObject: interest
            })

            // Debug isAdmin calculation
            const creatorId = interest.creator?._id || interest.creator?.id || interest.creator || interest.user?._id || interest.user?.id || interest.user;
            const currentUserId = currentUser?._id || currentUser?.id;
            const isCreator = creatorId === currentUserId;
            const hasAdminRole = interest?.currentUserMembership?.role === 'admin' || interest?.currentUserMembership?.role === 'creator';

            console.log('🔐 Admin Check Debug:', {
                'interest.isAdmin (UNRELIABLE)': interest?.isAdmin,
                'creatorId': creatorId,
                'currentUserId': currentUserId,
                'isCreator': isCreator,
                'currentUserMembership': interest?.currentUserMembership,
                'membership.role': interest?.currentUserMembership?.role,
                'hasAdminRole': hasAdminRole,
                'FINAL isAdmin': isCreator || hasAdminRole
            });
        }
    }, [interest, currentUser])

    const fetchInterestDetails = async () => {
        try {
            setLoading(true)
            const res = await GetInterestDetailsApi({
                data: {
                    interestId: interestId as string,
                    includeMembers: true,
                    ts: Date.now()
                } as any
            })
            // @ts-ignore
            if (res.status && res.data) {
                setInterest(res.data)
            }
        } catch (err) {
            console.error(err)
            ErrorToast('Failed to load interest group details')
        } finally {
            setLoading(false)
        }
    }

    // Track successfully created post to handle eventual consistency (indexing lag)
    const latestCreatedPostRef = React.useRef<any>(null)

    const fetchFeed = async () => {
        try {
            setLoadingFeed(true)
            const res = await GetInterestFeedApi({ data: { interestId: interestId as string, page: 1, perPage: 20, sort: '-createdAt', ts: Date.now() } })
            // @ts-ignore
            if (res.status || res.success) {
                console.log('Feed API Response Data:', res.data);
                let feedData = res.data?.posts || res.data?.docs || res.data?.data || (Array.isArray(res.data) ? res.data : [])

                // Smart Merge: If we recently created a post but backend hasn't indexed it yet, inject it back in.
                if (latestCreatedPostRef.current) {
                    const found = feedData.find((p: any) => p._id === latestCreatedPostRef.current._id);
                    if (!found) {
                        console.log('Re-injecting missing optimistic post:', latestCreatedPostRef.current._id);
                        feedData = [latestCreatedPostRef.current, ...feedData];
                    }
                }

                // Ensure sorted by newest first
                feedData = feedData.sort((a: any, b: any) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return dateB - dateA;
                })

                console.log('First Post Example:', feedData[0]);
                setPosts(feedData)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingFeed(false)
        }
    }

    const fetchMembers = async () => {
        try {
            setLoadingMembers(true)
            const mongoId = interest?._id || interest?.id || (interestId as string);
            // Add a timestamp to bypass any caching
            const res = await GetInterestMembersApi({ data: { interestId: mongoId, ts: Date.now() } as any })
            console.log('👥 fetchMembers Response (Fresh):', res);
            // @ts-ignore
            if ((res.status || res.success) && res.data) {
                // The response can be an array directly, or an object with members/docs property
                const memberData = Array.isArray(res.data) ? res.data : (res.data.members || res.data.docs || [])
                console.log(`👥 setting members (${memberData.length} found)`);
                setMembers(memberData)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingMembers(false)
        }
    }

    const fetchRequests = async () => {
        try {
            setLoadingRequests(true)
            const res = await GetJoinRequestsApi({ data: { interestId: interestId as string } })
            // @ts-ignore
            if ((res.status || res.success) && res.data) {
                const data = Array.isArray(res.data) ? res.data : (res.data.docs || [])
                setRequests(data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingRequests(false)
        }
    }

    const handleJoin = async () => {
        try {
            setLoading(true)
            const res = await JoinInterestApi({ data: { interestId: interestId as string } })
            console.log('🤝 Join Response:', res);
            if (res.status) {
                Success(res.message || 'Joined successfully')
                // Lock status to joined
                setMembershipAction({ status: true, ts: Date.now() });

                // Optimistic update for interest status
                setInterest((prev: any) => prev ? {
                    ...prev,
                    isMember: true,
                    currentUserMembership: { ...prev.currentUserMembership, status: 'member' }
                } : null);

                // Optimistic update for members list
                if (currentUser) {
                    const newUser = {
                        _id: currentUser._id || currentUser.id,
                        user: {
                            _id: currentUser._id || currentUser.id,
                            firstName: currentUser.firstName || currentUser.fullName?.split(' ')[0] || 'Me',
                            lastName: currentUser.lastName || currentUser.fullName?.split(' ')[1] || '',
                            image: currentUser.image,
                            email: currentUser.email
                        },
                        role: 'member'
                    };
                    setMembers((prev: any[]) => {
                        // Check if already in list to avoid duplicates
                        const exists = prev.some(m => {
                            const mId = m.user?._id || m.user?.id || m.userDetails?._id || m.userDetails?.id || m._id;
                            return String(mId) === String(newUser._id);
                        });
                        return exists ? prev : [newUser, ...prev];
                    });
                }

                // Refresh after a longer delay to ensure DB sync
                setTimeout(() => {
                    console.log('🔄 background refresh after join (Fresh hit)');
                    // Note: We might get old data if DB is slow, but our lock prevents UI flickering
                    fetchInterestDetails()
                    fetchMembers()
                }, 2500)
            }
        } catch (err) {
            ErrorToast('Failed to join group')
        } finally {
            setLoading(false)
        }
    }

    const handleLeave = async () => {
        if (!confirm('Are you sure you want to leave this group?')) return;
        try {
            setLoading(true)
            const mongoId = interest?._id || interest?.id || (interestId as string);

            const currentEmail = currentUser?.email?.toLowerCase();
            const currentFullName = (currentUser?.fullName || currentUser?.name || `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`).trim().toLowerCase();

            const currentMember = members.find(m => {
                const memberEmail = (m.email || m.userDetails?.email || m.user?.email || m.user?.userDetails?.email)?.toLowerCase();
                const mFName = m.firstName || m.userDetails?.firstName || m.user?.firstName || '';
                const mLName = m.lastName || m.userDetails?.lastName || m.user?.lastName || '';
                const memberFullName = (m.fullName || `${mFName} ${mLName}`).trim().toLowerCase();

                return (memberEmail && currentEmail && memberEmail === currentEmail) ||
                    (memberFullName && currentFullName && memberFullName === currentFullName);
            });

            const jetzyUserId = currentMember ? (currentMember.user?._id || currentMember.user?.id || currentMember.user || currentMember.userDetails?._id || currentMember._id) : null;
            const userIdToUse = jetzyUserId || currentUser?._id || currentUser?.id;

            console.log('🚪 handleLeave Debug:', {
                foundMember: !!currentMember,
                memberIdFromList: jetzyUserId,
                currentUserId: currentUser?._id || currentUser?.id,
                FINAL_ID_TO_REMOVE: userIdToUse
            });

            if (userIdToUse) {
                const res = await RemoveMemberApi({ data: { interestId: mongoId, users: [userIdToUse] } })
                if (res.status) {
                    Success('Left group successfully')
                    // Lock status to left
                    setMembershipAction({ status: false, ts: Date.now() });

                    // Optimistic update
                    setInterest((prev: any) => prev ? {
                        ...prev,
                        isMember: false,
                        currentUserMembership: { ...prev.currentUserMembership, status: 'non-member' }
                    } : null);
                    setMembers((prev: any[]) => prev.filter(m => {
                        const mId = m.user?._id || m.user?.id || m.userDetails?._id || m.userDetails?.id || m._id;
                        const mEmail = (m.email || m.userDetails?.email || m.user?.email)?.toLowerCase();
                        return String(mId) !== String(userIdToUse) && mEmail !== currentEmail;
                    }));
                    // Refresh after delay
                    setTimeout(() => {
                        console.log('🔄 background refresh after leave (Fresh hit)');
                        fetchInterestDetails()
                        fetchMembers()
                    }, 2500)
                } else {
                    ErrorToast(res.message || 'Failed to leave group')
                }
            }
        } catch (err) {
            console.error('🚪 handleLeave Error:', err);
            ErrorToast('Failed to leave group')
        } finally {
            setLoading(false)
        }
    }

    const handleRemoveMember = async (userId: string) => {
        if (!confirm('Are you sure you want to remove this member?')) return;
        try {
            setLoadingMembers(true)
            const mongoId = interest?._id || interest?.id || (interestId as string);
            const res = await RemoveMemberApi({ data: { interestId: mongoId, users: [userId] } })
            if (res.status) {
                Success('Member removed successfully')
                // Optimistic removal
                setMembers(prev => prev.filter(m => {
                    const mId = m.user?._id || m.user?.id || m.userDetails?._id || m.userDetails?.id || m._id;
                    return String(mId) !== String(userId);
                }));
                setTimeout(() => {
                    console.log('🔄 background refresh after remove (Fresh hit)');
                    fetchMembers()
                    fetchInterestDetails()
                }, 2500)
            } else {
                ErrorToast(res.message || 'Failed to remove member')
            }
        } catch (err) {
            console.error('👤 handleRemoveMember Error:', err);
            ErrorToast('Failed to remove member')
        } finally {
            setLoadingMembers(false)
        }
    }

    const handleRequestAction = async (userId: string, action: 'accept' | 'reject') => {
        try {
            const res = await JoinRequestActionApi({
                data: { interestId: interestId as string, userId, action }
            })
            if (res.status) {
                Success(`Request ${action}ed`)
                fetchRequests()
                if (action === 'accept') fetchMembers()
            }
        } catch (err) {
            ErrorToast(`Failed to ${action} request`)
        }
    }

    const handleDeleteGroup = async () => {
        if (!confirm('CRITICAL: Delete this whole group? This cannot be undone.')) return;
        try {
            setLoading(true)
            const res = await DeleteInterestGroupApi({ data: { interestId: interestId as string } })
            if (res.status) {
                Success('Group deleted')
                router.push('/interests')
            }
        } catch (err) {
            ErrorToast('Failed to delete group')
        } finally {
            setLoading(false)
        }
    }

    const handleCreatePost = async (text: string, media: any[] = []) => {
        try {
            const res = await CreatePostApi({
                data: {
                    content: text,
                    // description: text,
                    media: media,
                    interestIds: [interestId as string],
                    interest: [interestId as string],
                    privacy: 'public'
                }
            })
            if (res.status) {
                Success('Post created')
                console.log('Create Post Response:', res);
                if (res.data) {
                    const newPost = {
                        ...res.data,
                        createdAt: res.data.createdAt || new Date().toISOString(),
                        user: typeof res.data.user === 'string' ? { _id: res.data.user, firstName: 'Me', image: null } : res.data.user
                    }
                    latestCreatedPostRef.current = newPost;
                    setPosts(prev => [newPost, ...prev])
                }
                setTimeout(() => fetchFeed(), 4000)
            }
        } catch (err) {
            ErrorToast('Failed to create post')
        }
    }

    const handleDeletePost = async (postId: string) => {
        if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
            return;
        }

        // Optimistic update - remove from UI immediately
        setPosts(prev => prev.filter(p => p._id !== postId));

        try {
            const res = await DeletePostApi({ data: { postId } });
            // @ts-ignore
            if (res.status || res.success) {
                Success('Post deleted successfully');
            } else {
                throw new Error('Delete failed');
            }
        } catch (err) {
            ErrorToast('Failed to delete post');
            console.error('Delete post error:', err);
            // Rollback on error - refetch feed
            fetchFeed();
        }
    }


    const handleLike = async (postId: string, isLiked: boolean) => {
        // Optimistic UI update
        setPosts(prev => prev.map(p => {
            if (p._id === postId) {
                const newLiked = !isLiked;
                return {
                    ...p,
                    isLiked: newLiked,
                    hasReacted: newLiked,
                    likesCount: newLiked ? (p.likesCount || 0) + 1 : Math.max(0, (p.likesCount || 0) - 1)
                }
            }
            return p;
        }));

        try {
            const res = await LikePostApi({ data: { postId, reactionType: 'love' } })
            console.log('Like Response:', res);
            // @ts-ignore
            if (res.status || res.success) {
                if (res.data && typeof res.data.totalReactions === 'object') {
                    // Sync with actual server data if available and valid
                    setPosts(prev => prev.map(p =>
                        p._id === postId ? {
                            ...p,
                            likesCount: res.data.totalReactions?.total ?? p.likesCount,
                            hasReacted: res.data.hasReacted ?? p.hasReacted,
                            isLiked: res.data.hasReacted ?? p.isLiked
                        } : p
                    ));
                }
                // Don't fetchFeed immediately to avoid race condition with stale counters
            }
        } catch (err) {
            console.error('Like error:', err)
            // Rollback on error
            fetchFeed()
        }
    }

    const handleComment = async (postId: string, text: string, image?: string) => {
        try {
            const res = await CreateCommentApi({ data: { postId, content: text, image } })
            // @ts-ignore
            if (res.status || res.success) {
                Success('Comment added')
                // Optimistically increment count
                setPosts(prev => prev.map(p =>
                    p._id === postId ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
                ))
                // Delay fetchFeed to give backend time to update aggregators
                setTimeout(() => fetchFeed(), 1000)

                // Return data with optimistic author info if missing
                return {
                    ...res.data,
                    image: res.data.image || image,
                    author: res.data.author || res.data.user || currentUser || {
                        firstName: currentUser?.firstName || "User",
                        lastName: currentUser?.lastName || "",
                        image: currentUser?.image || null
                    },
                    createdAt: res.data.createdAt || new Date().toISOString()
                };
            }
        } catch (err) {
            ErrorToast('Failed to add comment')
            console.error('Comment error:', err)
        }
        return null;
    }

    const handleLikeComment = async (postId: string, commentId: string) => {
        console.log('Liking comment:', commentId);
        try {
            const res = await ReactToCommentApi({ data: { commentId, type: 'like' } });
            // @ts-ignore
            if (res.status || res.success) {
                console.log('Comment liked successfully');
                // Refresh comments to get updated counts/state
                // Since we don't have direct access to setComments for specific post here without prop drilling setComments
                // We will rely on onFetchComments triggering a refresh or we can force a fetch
                // But wait, InterestFeed handles its own comments state via onFetchComments. 
                // Actually, InterestFeed stores comments in local state. 
                // We need to update the state in InterestFeed? No, InterestFeed calls onFetchComments.
                // We can't update InterestFeed state from here easily unless we move comments state up or use a ref/context.
                // However, InterestFeed expects us to return data or it handles things itself?
                // InterestFeed has 'handleLikeCommentClick' which calls this.
                // We should probably move the state update logic for *this specific action* into InterestFeed or 
                // have this function return the updated comment?
                // For now, let's just let InterestFeed know to refetch or assume optimistic update there?
                // InterestFeed doesn't implement optimistic update for likes yet.

                // Let's implement full refresh for simplicity first
                // Actually we can't easily trigger InterestFeed to refresh from here for a specific post.
                // We will implement optimistic update inside InterestFeed if possible, 
                // OR we assume InterestFeed will refetch. 
                // But wait, InterestFeed *calls* this. It doesn't wait for return. 
            }
        } catch (err) {
            console.error('Failed to like comment:', err);
        }
    }

    const handleUpdateComment = async (postId: string, commentId: string, content: string) => {
        try {
            await UpdateCommentApi({ data: { commentId, content } });
            Success('Comment updated');
        } catch (err) {
            throw err; // Let component handle rollback
        }
    }

    const handleFetchComments = async (postId: string) => {
        try {
            console.log('Fetching all comments for post:', postId);
            const res = await GetPostCommentsApi({
                data: {
                    postId,
                    page: 1,
                    limit: 100,
                    sortBy: 'newest',
                    includeReplies: true,
                    maxDepth: 5
                }
            })
            // ... (rest of logic same)

            if (res && res.data) {
                const commentData = res.data.comments || res.data.docs || res.data.data || (Array.isArray(res.data) ? res.data : [])

                // Map API response to match standard format if needed, specifically for likes/reactions
                // Ensure isLiked and likesCount are present if the API provides reaction details differently
                return commentData.map((c: any) => ({
                    ...c,
                    isLiked: c.isLiked || c.hasReacted || false,
                    likesCount: c.likesCount || c.reactionCounts?.total || c.totalReactions || 0
                }));
            }

            return []
        } catch (err) {
            console.error('Fetch comments error:', err)
            return []
        }
    }


    if (loading && !interest) {
        return <div className="min-h-screen flex items-center justify-center bg-black"><Spinner /></div>
    }

    if (waitingForAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="text-center">
                    <Spinner />
                    <p className="text-gray-400 mt-4">Authenticating...</p>
                    {/* Add a button to skip waiting if user believes they have the token */}
                    <button
                        onClick={() => setWaitingForAuth(false)}
                        className="mt-6 text-xs text-app border border-app/30 px-3 py-1 rounded hover:bg-app/10 transition-colors"
                    >
                        Click here if it takes too long
                    </button>
                </div>
            </div>
        )
    }

    // ... (rest of auth checks)

    return (
        <div className="min-h-screen bg-black pb-20">
            <Head>
                <title>{interest?.name ? `${interest.name} | Jetzy` : 'Interest Group'}</title>
            </Head>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {isAdmin && (
                    <button
                        onClick={() => router.push('/interests')}
                        className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-6 group w-fit"
                    >
                        <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to Interests
                    </button>
                )}

                <InterestGroupHeader
                    interest={{ ...interest, isMember: isMember }}
                    onJoin={handleJoin}
                    onLeave={handleLeave}
                    loading={loading}
                    memberCount={members.length > 0 ? members.length : interest?.memberCount}
                />

                {/* Tabs */}
                <div className="mb-6 border-b border-gray-800 flex justify-between items-center">
                    <div className="flex gap-8">
                        <button
                            onClick={() => setActiveTab('feed')}
                            className={`pb-4 px-2 font-medium transition-colors relative ${activeTab === 'feed' ? 'text-app' : 'text-gray-400 hover:text-white'}`}
                        >
                            Feed
                            {activeTab === 'feed' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-app rounded-full" />}
                        </button>
                        {isAdmin && (
                            <button
                                onClick={() => setActiveTab('requests')}
                                className={`pb-4 px-2 font-medium transition-colors relative ${activeTab === 'requests' ? 'text-app' : 'text-gray-400 hover:text-white'}`}
                            >
                                Join Requests
                                {requests.length > 0 && <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{requests.length}</span>}
                                {activeTab === 'requests' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-app rounded-full" />}
                            </button>
                        )}
                    </div>

                    <div className="flex gap-4 items-center">
                        <button
                            onClick={() => setActiveTab('members')}
                            className={`pb-4 px-2 font-medium transition-colors relative ${activeTab === 'members' ? 'text-app' : 'text-gray-400 hover:text-white'}`}
                        >
                            Members
                            {activeTab === 'members' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-app rounded-full" />}
                        </button>
                        {isAdmin && (
                            <button
                                onClick={handleDeleteGroup}
                                className="mb-4 text-gray-500 hover:text-red-500 transition-colors bg-gray-900/50 p-2 rounded-lg"
                                title="Delete Group"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                {/* Content */}
                {activeTab === 'feed' && (
                    <>
                        <div className="flex justify-end mb-2">
                            <button
                                onClick={handleRefresh}
                                className="text-xs text-app hover:text-white transition-colors flex items-center gap-1"
                                disabled={loadingFeed || loadingMembers}
                            >
                                <span>Refresh</span>
                            </button>
                        </div>
                        <PeopleWidget
                            creator={interest?.creator || interest?.user || interest?.owner || (isAdmin ? currentUser : null)}
                            members={members}
                            onViewAll={() => setActiveTab('members')}
                        />
                        <InterestFeed
                            posts={posts}
                            loading={loadingFeed}
                            currentUserId={currentUser?._id || currentUser?.id}
                            onCreatePost={handleCreatePost}
                            onDeletePost={handleDeletePost}
                            onLike={handleLike}
                            onComment={handleComment}
                            onFetchComments={handleFetchComments}
                            onLikeComment={handleLikeComment}
                            onUpdateComment={handleUpdateComment}
                        />
                    </>
                )}

                {activeTab === 'members' && (
                    <InterestMembers
                        interestId={interestId as string}
                        members={members}
                        loading={loadingMembers}
                        creator={interest?.creator || interest?.user}
                        isAdmin={isAdmin}
                        onRemoveMember={handleRemoveMember}
                    />
                )}

                {activeTab === 'requests' && isAdmin && (
                    <div className="space-y-4">
                        {loadingRequests ? <Spinner /> : requests.length === 0 ? (
                            <div className="text-gray-500 py-10 text-center bg-[#1E1E1E] rounded-xl">No pending requests</div>
                        ) : (
                            requests.map((req: any) => (
                                <div key={req._id} className="flex items-center justify-between bg-[#1E1E1E] p-4 rounded-xl shadow-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden">
                                            {(req.userDetails?.image || req.user?.image) && (
                                                <img src={req.userDetails?.image || req.user?.image} alt="" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">
                                                {req.userDetails?.firstName || req.user?.firstName} {req.userDetails?.lastName || req.user?.lastName}
                                            </p>
                                            <p className="text-xs text-gray-400">Requested on {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A'}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleRequestAction(req.userDetails?._id || req.user?._id, 'accept')}
                                            className="p-2 bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500 hover:text-white transition-all"
                                        >
                                            <CheckIcon className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleRequestAction(req.userDetails?._id || req.user?._id, 'reject')}
                                            className="p-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                        >
                                            <XMarkIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
    return authorizedOnly(context)
}
