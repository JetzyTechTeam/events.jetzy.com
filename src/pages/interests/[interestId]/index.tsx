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
        const creatorId = interest.creator?._id || interest.creator?.id || interest.creator || interest.user?._id || interest.user?.id || interest.user;
        const currentUserId = currentUser._id || currentUser.id;

        // Check if user is creator
        const isCreator = creatorId === currentUserId;

        // Check if user has admin/creator role in membership
        const hasAdminRole = interest?.currentUserMembership?.role === 'admin' || interest?.currentUserMembership?.role === 'creator';

        return isCreator || hasAdminRole;
    }, [interest, currentUser]);

    const isMember = interest?.isMember || interest?.currentUserMembership?.status === 'member';

    // Feed State
    const [posts, setPosts] = useState<any[]>([])
    const [loadingFeed, setLoadingFeed] = useState(false)

    // Members State
    const [members, setMembers] = useState<any[]>([])
    const [loadingMembers, setLoadingMembers] = useState(false)

    // Requests State (Admin only)
    const [requests, setRequests] = useState<any[]>([])
    const [loadingRequests, setLoadingRequests] = useState(false)

    useEffect(() => {
        if (interestId) {
            fetchInterestDetails()
        }
    }, [interestId])

    useEffect(() => {
        if (interestId) {
            if (activeTab === 'feed') fetchFeed()
            if (activeTab === 'members') fetchMembers()
            if (activeTab === 'requests') fetchRequests()
        }
    }, [interestId, activeTab])


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
            const res = await GetInterestDetailsApi({ data: { interestId: interestId as string, includeMembers: true } })
            console.log('Interest API Response:', res);
            // @ts-ignore
            if ((res.status || res.success) && res.data) {
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
            const res = await GetInterestMembersApi({ data: { interestId: interestId as string } })
            // @ts-ignore
            if ((res.status || res.success) && res.data) {
                setMembers(res.data.docs || [])
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
            if (res.status) {
                Success(res.message || 'Joined successfully')
                fetchInterestDetails()
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
            const response = await fetch('/api/auth/session')
            const session = await response.json()
            const userId = session?.user?.id || session?.user?._id;

            if (userId) {
                const res = await RemoveMemberApi({ data: { interestId: interestId as string, users: [userId] } })
                if (res.status) {
                    Success('Left group successfully')
                    fetchInterestDetails()
                }
            }
        } catch (err) {
            ErrorToast('Failed to leave group')
        } finally {
            setLoading(false)
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

    const handleComment = async (postId: string, text: string) => {
        try {
            const res = await CreateCommentApi({ data: { postId, content: text } })
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
                    sortBy: 'newest'
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

    // ... (rest of auth checks)

    return (
        <div className="min-h-screen bg-black pb-20">
            {/* ... (Head and Header) */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                {/* ... (Header and Tabs) */}
                {/* Content */}
                {activeTab === 'feed' && (
                    <>
                        <div className="flex justify-end mb-2">
                            <button
                                onClick={fetchFeed}
                                className="text-xs text-app hover:text-white transition-colors flex items-center gap-1"
                                disabled={loadingFeed}
                            >
                                <span>Refresh</span>
                            </button>
                        </div>
                        <PeopleWidget creator={interest?.creator || interest?.user || interest?.owner || (isAdmin ? currentUser : null)} />
                        <InterestFeed
                            posts={posts}
                            loading={loadingFeed}
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
