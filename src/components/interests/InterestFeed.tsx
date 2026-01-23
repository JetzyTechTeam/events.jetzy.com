import React, { useState } from 'react'
import { HeartIcon as HeartIconSolid, ChatBubbleLeftIcon } from '@heroicons/react/24/solid'
import { HeartIcon as HeartIconOutline } from '@heroicons/react/24/outline'
import Spinner from '@Jetzy/components/misc/Spinner'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

interface InterestFeedProps {
    posts: any[];
    loading: boolean;
    onCreatePost: (text: string) => void;
    onLike: (postId: string, isLiked: boolean) => void;
    onComment: (postId: string, text: string) => Promise<void>;
    onFetchComments: (postId: string) => Promise<any[]>;
}

export default function InterestFeed({ posts, loading, onCreatePost, onLike, onComment, onFetchComments }: InterestFeedProps) {
    const [newPostText, setNewPostText] = useState('')
    const [posting, setPosting] = useState(false)
    const [newCommentTexts, setNewCommentTexts] = useState<{ [key: string]: string }>({})
    const [comments, setComments] = useState<{ [key: string]: any[] }>({})
    const [loadingComments, setLoadingComments] = useState<{ [key: string]: boolean }>({})
    const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({})
    const [selectedImages, setSelectedImages] = useState<File[]>([])
    const [uploadingImage, setUploadingImage] = useState(false)
    const [imagePreviews, setImagePreviews] = useState<string[]>([])

    const handlePostSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newPostText.trim() && selectedImages.length === 0) return
        setPosting(true)

        // Upload images if any
        let mediaArr: any[] = []
        if (selectedImages.length > 0) {
            setUploadingImage(true)
            try {
                const token = typeof window !== 'undefined' ? sessionStorage.getItem('api_token') : null
                const uploadUrl = process.env.VITE_UPLOAD_API_URL || 'https://prod-api.jetzy.com/api/v1/uploader/multiple'

                for (const file of selectedImages) {
                    const uploadData = new FormData()
                    uploadData.append('upload_file', file)
                    uploadData.append('folder', 'posts')

                    const res = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: uploadData
                    })
                    const uploadRes = await res.json()
                    if (uploadRes.status && uploadRes.data && uploadRes.data.length > 0) {
                        mediaArr.push({
                            url: uploadRes.data[0].fileUrl,
                            type: 'image'
                        })
                    }
                }
            } catch (err) {
                console.error('Post image upload failed:', err)
            } finally {
                setUploadingImage(false)
            }
        }

        await (onCreatePost as any)(newPostText, mediaArr)
        setNewPostText('')
        setSelectedImages([])
        setImagePreviews([])
        setPosting(false)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        setSelectedImages(prev => [...prev, ...files])
        files.forEach(file => {
            const reader = new FileReader()
            reader.onload = (e) => {
                if (e.target?.result) setImagePreviews(prev => [...prev, e.target!.result as string])
            }
            reader.readAsDataURL(file)
        })
    }

    const removeImage = (index: number) => {
        setSelectedImages(prev => prev.filter((_, i) => i !== index))
        setImagePreviews(prev => prev.filter((_, i) => i !== index))
    }

    const fetchComments = async (postId: string) => {
        setLoadingComments(prev => ({ ...prev, [postId]: true }))
        try {
            const data = await onFetchComments(postId)
            console.log('InterestFeed comments for', postId, ':', data);
            setComments(prev => ({ ...prev, [postId]: data }))
        } finally {
            setLoadingComments(prev => ({ ...prev, [postId]: false }))
        }
    }

    const toggleComments = (postId: string) => {
        const isShowing = !showComments[postId]
        setShowComments(prev => ({ ...prev, [postId]: isShowing }))
        if (isShowing && (!comments[postId] || comments[postId].length === 0)) {
            fetchComments(postId)
        }
    }

    const handleCommentSubmit = async (postId: string) => {
        const text = newCommentTexts[postId];
        if (!text?.trim()) return;

        await onComment(postId, text);
        setNewCommentTexts(prev => ({ ...prev, [postId]: '' }));
        // Always fetch comments to update the local count
        fetchComments(postId)
        if (!showComments[postId]) {
            // Optional: Auto-open comments on post?
            // setShowComments(prev => ({ ...prev, [postId]: true }))
        }
    }


    return (
        <div className="space-y-6">
            {/* ... (Create Post section remains same) */}
            <div className="bg-[#1E1E1E] rounded-xl p-4 shadow-xl">
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex-shrink-0" />
                    <form onSubmit={handlePostSubmit} className="flex-1">
                        <textarea
                            value={newPostText}
                            onChange={(e) => setNewPostText(e.target.value)}
                            placeholder="Share something with the group..."
                            className="w-full bg-gray-800 text-white rounded-lg p-3 min-h-[80px] border-none focus:ring-1 focus:ring-app resize-none"
                        />

                        {/* Image Previews */}
                        {imagePreviews.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {imagePreviews.map((src, idx) => (
                                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden group">
                                        <img src={src} className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-between items-center mt-2">
                            <label className="cursor-pointer text-gray-400 hover:text-app transition-colors flex items-center gap-2 text-sm">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>Add Photo</span>
                                <input type="file" multiple accept="image/*" onChange={handleFileChange} className="hidden" />
                            </label>

                            <button
                                type="submit"
                                disabled={(!newPostText.trim() && selectedImages.length === 0) || posting || uploadingImage}
                                className="bg-app text-white px-6 py-1.5 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-app/80 transition-all"
                            >
                                {posting || uploadingImage ? <Spinner /> : 'Post'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Posts Feed */}
            {loading && posts.length === 0 ? (
                <div className="flex justify-center py-10">
                    <Spinner />
                </div>
            ) : posts.length === 0 ? (
                <div className="text-center text-gray-500 py-10 bg-[#1E1E1E] rounded-xl">
                    No posts yet. Start the conversation!
                </div>
            ) : (
                posts.map((post) => (
                    <div key={post._id} className="bg-[#1E1E1E] rounded-xl p-5 shadow-xl transition-all hover:shadow-2xl">
                        {/* Post Header */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700">
                                {(post.userDetails?.image || post.user?.image) ? (
                                    <img src={post.userDetails?.image || post.user?.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">
                                        {(post.userDetails?.firstName || post.user?.firstName || 'J')?.charAt(0)}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="text-white font-semibold text-sm">
                                    {post.userDetails?.firstName || post.user?.firstName} {post.userDetails?.lastName || post.user?.lastName}
                                </h4>
                                <p className="text-xs text-gray-400">
                                    {post.createdAt ? dayjs(post.createdAt).format('MMM D, YYYY • h:mm A') : ''}
                                </p>
                            </div>
                        </div>

                        {/* Post Content */}
                        <div className="text-gray-200 mb-4 whitespace-pre-wrap text-sm leading-relaxed">
                            {post.description || post.content || post.text || post.body || post.post || post.caption}
                        </div>

                        {/* Media Grid */}
                        {post.media && post.media.length > 0 && (
                            <div className={`grid gap-2 mb-4 rounded-lg overflow-hidden ${post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                {post.media.map((media: any, idx: number) => (
                                    <div key={idx} className="aspect-video bg-black/50">
                                        {(media.type === 'image' || !media.type) && (
                                            <img
                                                src={typeof media === 'string' ? media : (media.url || media.fileUrl || media.file)}
                                                alt="Post media"
                                                className="w-full h-full object-cover"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-6 pt-3 border-t border-gray-800">
                            <button
                                onClick={() => onLike(post._id, (post.isLiked || post.hasReacted))}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${(post.isLiked || post.hasReacted) ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                            >
                                {(post.isLiked || post.hasReacted) ? <HeartIconSolid className="w-5 h-5" /> : <HeartIconOutline className="w-5 h-5" />}
                                <span>{post.likesCount ?? post.totalReactions?.total ?? post.reactionCounts?.total ?? post.reactions?.likes ?? 0}</span>
                            </button>
                            <div className="flex-1 flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Write a comment..."
                                    value={newCommentTexts[post._id] || ''}
                                    onChange={(e) => setNewCommentTexts(prev => ({ ...prev, [post._id]: e.target.value }))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post._id)}
                                    className="flex-1 bg-gray-800/50 border-none rounded-lg px-3 py-1 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-app"
                                />
                                <button
                                    onClick={() => handleCommentSubmit(post._id)}
                                    className="text-gray-400 hover:text-app transition-colors"
                                >
                                    <ChatBubbleLeftIcon className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => toggleComments(post._id)}
                                    className="text-xs text-gray-400 hover:text-white"
                                >
                                    {comments[post._id] ? comments[post._id].length : (post.commentsCount ?? post.summary?.totalComments ?? post.commentCount ?? 0)} comments
                                </button>
                            </div>
                        </div>

                        {/* Comments List */}
                        {showComments[post._id] && (
                            <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
                                {loadingComments[post._id] ? (
                                    <div className="flex justify-center py-2"><Spinner /></div>
                                ) : comments[post._id]?.length === 0 ? (
                                    <p className="text-center text-xs text-gray-500">No comments yet.</p>
                                ) : (
                                    comments[post._id]?.map((comment) => {
                                        const author = comment.author || comment.userDetails || comment.user || {};
                                        return (
                                            <div key={comment._id} className="flex gap-3">
                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                                                    {author.image ? (
                                                        <img src={author.image} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]">
                                                            {(author.firstName || 'U')?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 bg-gray-800/30 rounded-lg p-2">
                                                    <h5 className="text-white text-xs font-semibold">
                                                        {author.firstName} {author.lastName}
                                                    </h5>
                                                    <p className="text-gray-300 text-xs mt-1">{comment.content}</p>
                                                    <p className="text-[10px] text-gray-500 mt-1">
                                                        {comment.createdAt ? dayjs(comment.createdAt).fromNow() : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    )
}
