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
    LikePostApi,
    CreateCommentApi,
    GetPostCommentsApi,
    GetJoinRequestsApi,
    JoinRequestActionApi,
    DeleteInterestGroupApi
} from '@Jetzy/services/interests/interestsapis'
import InterestGroupHeader from '@Jetzy/components/interests/InterestGroupHeader'
import InterestFeed from '@Jetzy/components/interests/InterestFeed'
import InterestMembers from '@Jetzy/components/interests/InterestMembers'
import Spinner from '@Jetzy/components/misc/Spinner'
import { Error, Success } from '@Jetzy/lib/_toaster'
import { CheckIcon, XMarkIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/solid'
import PeopleWidget from '@Jetzy/components/users/PeopleWidget'

export default function InterestGroupPage() {
    const router = useRouter()
    const { interestId } = router.query
    const [loading, setLoading] = useState(true)
    const [interest, setInterest] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<'feed' | 'members' | 'requests'>('feed')
    const [currentUser, setCurrentUser] = useState<any>(null)

    useEffect(() => {
        // Fetch current user session to potentially use as fallback if they are the creator
        const fetchSession = async () => {
            try {
                const response = await fetch('/api/auth/session')
                const session = await response.json()
                if (session?.user) {
                    setCurrentUser(session.user)
                }
            } catch (e) {
                console.error(e)
            }
        }
        fetchSession()
    }, [])

    const isAdmin = interest?.isAdmin || interest?.currentUserMembership?.role === 'admin' || interest?.currentUserMembership?.role === 'creator';
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
        }
    }, [interest])

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
            Error('Failed to load interest group details')
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
            Error('Failed to join group')
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
            Error('Failed to leave group')
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
            Error(`Failed to ${action} request`)
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
            Error('Failed to delete group')
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
            Error('Failed to create post')
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
                    author: res.data.author || res.data.user || {
                        firstName: "Super",
                        lastName: "Admin",
                        image: "https://storage.googleapis.com/media-jetzy/jetzy/jetzy-prod/prod-dist/mnt/images/jetzy/user_profile/52f/b60/52fb607b331b4076bb9bf25aeccace73/base.jpg"
                    },
                    createdAt: res.data.createdAt || new Date().toISOString()
                };
            }
        } catch (err) {
            Error('Failed to add comment')
            console.error('Comment error:', err)
        }
        return null;
    }

    const handleFetchComments = async (postId: string) => {
        try {
            console.log('Fetching all comments for post:', postId);
            const res = await GetPostCommentsApi({
                data: {
                    postId,
                    page: 1,
                    limit: 100,
                    sortBy: 'popular',
                    includeReplies: true,
                    maxDepth: 5
                }
            })
            console.log('Raw API Response for comments:', res);

            // Some APIs might return status: false even if data is present
            if (res && res.data) {
                // Try multiple possible data locations
                const commentData = res.data.comments || res.data.docs || res.data.data || (Array.isArray(res.data) ? res.data : [])
                console.log('Extracted comment data:', commentData);
                console.log('Comment count:', commentData.length);
                console.log('Pagination metadata:', res.data.pagination);

                // If we got fewer comments than expected, log a warning
                if (res.data.pagination) {
                    const { page, perPage, nextPage } = res.data.pagination;
                    console.log(`📊 Pagination: Page ${page}, PerPage ${perPage}, NextPage: ${nextPage}`);
                    if (nextPage) {
                        console.warn('⚠️ There are more comments available! NextPage:', nextPage);
                    }
                }

                return commentData
            }

            console.warn('No data in response:', res);
            return []
        } catch (err) {
            console.error('Fetch comments error:', err)
            return []
        }
    }


    if (loading && !interest) {
        return <div className="min-h-screen flex items-center justify-center bg-black"><Spinner /></div>
    }

    return (
        <div className="min-h-screen bg-black pb-20">
            <Head>
                <title>{interest?.name ? `${interest.name} | Jetzy` : 'Interest Group'}</title>
            </Head>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
                <button
                    onClick={() => router.push('/interests')}
                    className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors mb-6 group w-fit"
                >
                    <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back to Interests
                </button>

                <InterestGroupHeader
                    interest={interest}
                    onJoin={handleJoin}
                    onLeave={handleLeave}
                    loading={loading}
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
                        <button
                            onClick={() => setActiveTab('members')}
                            className={`pb-4 px-2 font-medium transition-colors relative ${activeTab === 'members' ? 'text-app' : 'text-gray-400 hover:text-white'}`}
                        >
                            Members
                            {activeTab === 'members' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-app rounded-full" />}
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
                            onLike={handleLike}
                            onComment={handleComment}
                            onFetchComments={handleFetchComments}
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
