import React, { useState, useEffect, useRef } from 'react'
import { HeartIcon as HeartIconSolid, ChatBubbleLeftIcon, TrashIcon, ArrowUturnLeftIcon, PencilIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/solid'
import { HeartIcon as HeartIconOutline } from '@heroicons/react/24/outline'
import Spinner from '@Jetzy/components/misc/Spinner'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { DeleteCommentApi } from '@Jetzy/services/interests/interestsapis'
import { Error as ErrorToast, Success } from '@Jetzy/lib/_toaster'

dayjs.extend(relativeTime)

interface InterestFeedProps {
    posts: any[];
    loading: boolean;
    onCreatePost: (text: string, media?: any[]) => void;
    onDeletePost: (postId: string) => void;
    onLike: (postId: string, isLiked: boolean) => void;
    onComment: (postId: string, text: string, image?: string) => Promise<any>;
    onFetchComments: (postId: string) => Promise<any[]>;
    onLikeComment?: (postId: string, commentId: string) => void;
    onUpdateComment?: (postId: string, commentId: string, content: string) => Promise<void>;
    currentUserId?: string | null;
}

const parseMentions = (content: string, mentions: any[] = []) => {
    // Parse both formats: <mention:USER_ID> and @[Name](id)
    const mentionRegex = /<mention:([^>]+)>|@\s?\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        // Add text before mention
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
        }

        if (match[1]) {
            // Format: <mention:USER_ID>
            const userId = match[1];
            const mentionedUser = mentions?.find((m: any) => (m._id === userId || m.id === userId));
            const name = mentionedUser ? `${mentionedUser.firstName || ''} ${mentionedUser.lastName || ''}`.trim() : 'User';
            parts.push({ type: 'mention', userId, name: name || 'User' });
        } else if (match[2] && match[3]) {
            // Format: @[Name](id)
            const name = match[2];
            const userId = match[3];
            parts.push({ type: 'mention', userId, name });
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
        parts.push({ type: 'text', content: content.substring(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content }];
}

// Sub-component for Comments to handle scrolling
const CommentItem = ({
    comment,
    post,
    currentUserId,
    onLikeComment,
    onReply,
    onDelete,
    onEditInit,
    editingComment,
    onEditSave,
    setEditingComment,
    level = 0
}: any) => {
    const author = comment.author || comment.userDetails || comment.user || {};
    const authorId = author._id || author.id || comment.userId;
    const isCommentAuthor = currentUserId && authorId && (currentUserId === authorId);

    return (
        <div key={comment._id} className={`flex flex-col gap-3 group ${level > 0 ? 'ml-6 border-l border-gray-800 pl-4' : ''}`}>
            <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                    {author.image ? (
                        <img src={author.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]">
                            {(author.firstName || 'U')?.charAt(0)}
                        </div>
                    )}
                </div>
                <div className="flex-1 bg-gray-800/30 rounded-lg p-2 relative">
                    <h5 className="text-white text-xs font-semibold">
                        {author.firstName} {author.lastName}
                    </h5>
                    {editingComment?.commentId === comment._id ? (
                        <div className="mt-1">
                            <textarea
                                value={editingComment.content}
                                onChange={(e) => setEditingComment((prev: any) => prev ? { ...prev, content: e.target.value } : null)}
                                className="w-full bg-gray-900 border border-gray-700 rounded p-1 text-xs text-white resize-none focus:border-app outline-none"
                                rows={2}
                            />
                            <div className="flex justify-end gap-2 mt-1">
                                <button onClick={() => setEditingComment(null)} className="text-gray-400 hover:text-white">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                                <button onClick={onEditSave} className="text-app hover:text-white">
                                    <CheckIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-gray-300 text-xs mt-1">
                            {parseMentions(comment.content || '', comment.mentions || []).map((part: any, idx: number) => (
                                part.type === 'mention' ? (
                                    <span key={idx} className="text-blue-500 font-medium">@{part.name}</span>
                                ) : (
                                    <span key={idx}>{part.content}</span>
                                )
                            ))}
                        </p>
                    )}

                    {comment.image && (
                        <div className="mt-2 rounded-xl overflow-hidden max-w-[280px] border border-gray-700/50 shadow-inner group/img relative">
                            <img
                                src={comment.image}
                                alt="Comment media"
                                className="w-full h-auto max-h-[300px] object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                                onClick={() => window.open(comment.image, '_blank')}
                            />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                                <span className="text-[10px] text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">View Full Image</span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-1">
                        <p className="text-[10px] text-gray-500">
                            {comment.createdAt ? dayjs(comment.createdAt).fromNow() : ''}
                        </p>
                        <button
                            onClick={() => onReply(post._id, comment)}
                            className="text-[10px] text-gray-400 hover:text-app transition-colors"
                        >
                            Reply
                        </button>
                        <button
                            onClick={() => onLikeComment(post._id, comment._id)}
                            className={`flex items-center gap-1 text-[10px] transition-colors ${comment.isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                        >
                            {comment.isLiked ? <HeartIconSolid className="w-3 h-3" /> : <HeartIconOutline className="w-3 h-3" />}
                            <span>{comment.likesCount || comment.reactionCounts?.total || 0}</span>
                        </button>
                    </div>

                    {isCommentAuthor && !editingComment && (
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => onEditInit(post._id, comment)}
                                className="text-gray-500 hover:text-blue-500 transition-colors"
                                title="Edit comment"
                            >
                                <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => onDelete(post._id, comment._id)}
                                className="text-gray-500 hover:text-red-500 transition-colors"
                                title="Delete comment"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Render Replies Recursive */}
            {(comment.replies || comment.comments) && (comment.replies || comment.comments).length > 0 && (
                <div className="flex flex-col gap-4 mt-2">
                    {(comment.replies || comment.comments).map((reply: any) => (
                        <CommentItem
                            key={reply._id}
                            comment={reply}
                            post={post}
                            currentUserId={currentUserId}
                            onLikeComment={onLikeComment}
                            onReply={onReply}
                            onDelete={onDelete}
                            onEditInit={onEditInit}
                            editingComment={editingComment}
                            onEditSave={onEditSave}
                            setEditingComment={setEditingComment}
                            level={level + 1}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// Sub-component for Comments to handle scrolling
const PostComments = ({
    post,
    comments,
    loading,
    currentUserId,
    onLikeComment,
    onReply,
    onDelete,
    onEditInit,
    editingComment,
    onEditSave,
    setEditingComment
}: any) => {
    const bottomRef = useRef<HTMLDivElement>(null)

    // Scroll to bottom on mount and when comments change (new message)
    useEffect(() => {
        if (!loading && comments?.length > 0) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
    }, [comments?.length, loading])

    if (loading) return <div className="flex justify-center py-2"><Spinner /></div>
    if (!comments || comments.length === 0) return <p className="text-center text-xs text-gray-500">No comments yet.</p>

    return (
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
            {comments.map((comment: any) => (
                <CommentItem
                    key={comment._id}
                    comment={comment}
                    post={post}
                    currentUserId={currentUserId}
                    onLikeComment={onLikeComment}
                    onReply={onReply}
                    onDelete={onDelete}
                    onEditInit={onEditInit}
                    editingComment={editingComment}
                    onEditSave={onEditSave}
                    setEditingComment={setEditingComment}
                />
            ))}
            <div ref={bottomRef} className="h-1" />
        </div>
    )
}

export default function InterestFeed({
    posts,
    loading,
    onCreatePost,
    onDeletePost,
    onLike,
    onComment,
    onFetchComments,
    onLikeComment,
    onUpdateComment,
    currentUserId
}: InterestFeedProps) {
    const [newPostText, setNewPostText] = useState('')
    const [posting, setPosting] = useState(false)
    const [newCommentTexts, setNewCommentTexts] = useState<{ [key: string]: string }>({})
    const [comments, setComments] = useState<{ [key: string]: any[] }>({})
    const [loadingComments, setLoadingComments] = useState<{ [key: string]: boolean }>({})
    const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({})
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploadingImage, setUploadingImage] = useState(false)
    const [filePreviews, setFilePreviews] = useState<string[]>([])
    const [fileTypes, setFileTypes] = useState<('image' | 'video')[]>([])
    // const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [replyingTo, setReplyingTo] = useState<{ postId: string; commentId: string; userId: string; userName: string } | null>(null)
    const [editingComment, setEditingComment] = useState<{ postId: string; commentId: string; content: string } | null>(null)
    const [commentImages, setCommentImages] = useState<{ [key: string]: File | null }>({})
    const [commentImagePreviews, setCommentImagePreviews] = useState<{ [key: string]: string | null }>({})


    const handlePostSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newPostText.trim() && selectedFiles.length === 0) return
        setPosting(true)

        // Upload files if any
        let mediaArr: any[] = []
        if (selectedFiles.length > 0) {
            setUploadingImage(true)
            try {
                const token = typeof window !== 'undefined' ? sessionStorage.getItem('api_token') : null
                const uploadUrl = 'https://prod-api.jetzy.com/api/v1/uploader/multiple'

                for (let i = 0; i < selectedFiles.length; i++) {
                    const file = selectedFiles[i]
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
                            type: file.type.startsWith('video/') ? 'video' : 'image'
                        })
                    }
                }
            } catch (err) {
                console.error('Post media upload failed:', err)
            } finally {
                setUploadingImage(false)
            }
        }

        await onCreatePost(newPostText, mediaArr)
        setNewPostText('')
        setSelectedFiles([])
        setFilePreviews([])
        setFileTypes([])
        setPosting(false)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length === 0) return

        setSelectedFiles(prev => [...prev, ...files])
        files.forEach(file => {
            const isVideo = file.type.startsWith('video/')
            setFileTypes(prev => [...prev, isVideo ? 'video' : 'image'])
            if (isVideo) {
                const url = URL.createObjectURL(file)
                setFilePreviews(prev => [...prev, url])
            } else {
                const reader = new FileReader()
                reader.onload = (e) => {
                    if (e.target?.result) setFilePreviews(prev => [...prev, e.target!.result as string])
                }
                reader.readAsDataURL(file)
            }
        })
    }

    const removeImage = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
        setFilePreviews(prev => prev.filter((_, i) => i !== index))
        setFileTypes(prev => prev.filter((_, i) => i !== index))
    }

    const handleCommentFileChange = (postId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setCommentImages(prev => ({ ...prev, [postId]: file }))
        const reader = new FileReader()
        reader.onload = (e) => {
            if (e.target?.result) {
                setCommentImagePreviews(prev => ({ ...prev, [postId]: e.target!.result as string }))
            }
        }
        reader.readAsDataURL(file)
    }

    const removeCommentImage = (postId: string) => {
        setCommentImages(prev => ({ ...prev, [postId]: null }))
        setCommentImagePreviews(prev => ({ ...prev, [postId]: null }))
    }

    const fetchComments = async (postId: string) => {
        setLoadingComments(prev => ({ ...prev, [postId]: true }))
        try {
            const serverData = await onFetchComments(postId)

            setComments(prev => {
                const localComments = prev[postId] || [];
                console.log('🔄 Merging comments - Local:', localComments.length, 'Server:', serverData.length);

                // Merge server data with local comments
                // Keep all server comments, and add any local comments that don't exist on server yet
                const merged = [...serverData];
                localComments.forEach(local => {
                    // Only keep local ones that aren't in server data yet (by ID)
                    const existsOnServer = serverData.find((s: any) => s._id === local._id);
                    if (!existsOnServer) {
                        console.log('➕ Adding local comment not found on server:', local._id, local.content);
                        merged.push(local);
                    }
                });

                console.log('✅ Final merged count:', merged.length);

                // Sort by date to keep chat flow natural
                return {
                    ...prev,
                    [postId]: merged.sort((a: any, b: any) =>
                        new Date(a.createdAt || Date.now()).getTime() - new Date(b.createdAt || Date.now()).getTime()
                    )
                };
            });
        } finally {
            setLoadingComments(prev => ({ ...prev, [postId]: false }))
        }
    }

    const toggleComments = (postId: string) => {
        const isShowing = !showComments[postId]
        setShowComments(prev => ({ ...prev, [postId]: isShowing }))
        // Always fetch when showing to ensure we have the full list (not just the 2 from feed API)
        if (isShowing) {
            fetchComments(postId)
        }
    }

    const handleCommentSubmit = async (postId: string) => {
        let text = newCommentTexts[postId];
        if (!text?.trim()) return;

        // If replying, format with mention tag
        if (replyingTo && replyingTo.postId === postId) {
            // Replace @UserName with <mention:USER_ID>
            text = text.replace(`@${replyingTo.userName}`, `<mention:${replyingTo.userId}>`);
            setReplyingTo(null);
        }

        setNewCommentTexts(prev => ({ ...prev, [postId]: '' }));

        // Upload image if any
        let imageUrl = '';
        const imageFile = commentImages[postId];
        if (imageFile) {
            try {
                const token = typeof window !== 'undefined' ? sessionStorage.getItem('api_token') : null
                const uploadUrl = 'https://prod-api.jetzy.com/api/v1/uploader/multiple'
                const uploadData = new FormData()
                uploadData.append('upload_file', imageFile)
                uploadData.append('folder', 'posts')

                const res = await fetch(uploadUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadData
                })
                const uploadRes = await res.json()
                if (uploadRes.status && uploadRes.data && uploadRes.data.length > 0) {
                    imageUrl = uploadRes.data[0].fileUrl;
                }
            } catch (err) {
                console.error('Comment image upload failed:', err)
            }
        }

        // Clear image state early
        removeCommentImage(postId);

        try {
            const newComment = await onComment(postId, text, imageUrl);
            console.log('Comment created successfully:', newComment);

            if (newComment) {
                // Optimistically add to local comments state
                setComments(prev => ({
                    ...prev,
                    [postId]: [...(prev[postId] || []), newComment]
                }));

                // Ensure comments are visible
                setShowComments(prev => ({ ...prev, [postId]: true }));
            }
        } catch (err) {
            console.error('Failed to submit comment:', err);
        }

        // Wait longer for backend to index the new comment before refreshing
        setTimeout(() => fetchComments(postId), 5000);
    }

    const handleDeleteComment = async (postId: string, commentId: string) => {
        if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
            return;
        }

        // Optimistically remove from UI
        setComments(prev => ({
            ...prev,
            [postId]: (prev[postId] || []).filter(c => c._id !== commentId)
        }));

        try {
            const res = await DeleteCommentApi({ data: { commentId } });
            // @ts-ignore
            if (res.status || res.success) {
                Success('Comment deleted successfully');
                // Refresh comments after a delay
                setTimeout(() => fetchComments(postId), 1000);
            } else {
                throw new Error('Delete failed');
            }
        } catch (err) {
            ErrorToast('Failed to delete comment');
            console.error('Delete comment error:', err);
            // Rollback on error
            fetchComments(postId);
        }
    }

    const handleReplyToComment = (postId: string, comment: any) => {
        const author = comment.author || comment.userDetails || comment.user || {};
        const authorId = author._id || author.id || comment.userId;
        const authorName = `${author.firstName || 'User'} ${author.lastName || ''}`.trim();

        setReplyingTo({ postId, commentId: comment._id, userId: authorId, userName: authorName });
        setNewCommentTexts(prev => ({ ...prev, [postId]: `@${authorName} ` }));
        setShowComments(prev => ({ ...prev, [postId]: true }));
    }

    const handleEditCommentInit = (postId: string, comment: any) => {
        setEditingComment({ postId, commentId: comment._id, content: comment.content });
    }

    const handleEditCommentSave = async () => {
        if (!editingComment || !onUpdateComment) return;

        try {
            // Optimistic update
            setComments(prev => ({
                ...prev,
                [editingComment.postId]: prev[editingComment.postId].map(c =>
                    c._id === editingComment.commentId ? { ...c, content: editingComment.content } : c
                )
            }));

            await onUpdateComment(editingComment.postId, editingComment.commentId, editingComment.content);
            setEditingComment(null);
        } catch (err) {
            console.error('Failed to update comment:', err);
            ErrorToast('Failed to update comment');
            fetchComments(editingComment.postId); // Revert
        }
    }

    const handleLikeCommentClick = (postId: string, commentId: string) => {
        // Optimistic update
        setComments(prev => ({
            ...prev,
            [postId]: prev[postId].map(c => {
                if (c._id === commentId) {
                    const isLiked = c.isLiked;
                    return {
                        ...c,
                        isLiked: !isLiked,
                        likesCount: (c.likesCount || 0) + (isLiked ? -1 : 1)
                    };
                }
                return c;
            })
        }));

        if (onLikeComment) {
            onLikeComment(postId, commentId);
        }
    }

    return (
        <div className="space-y-6">
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

                        {filePreviews.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {filePreviews.map((src, idx) => (
                                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden group">
                                        {fileTypes[idx] === 'video' ? (
                                            <video src={src} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={src} className="w-full h-full object-cover" />
                                        )}
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
                            <label className={`text-gray-400 flex items-center gap-2 text-sm ${posting || uploadingImage ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer hover:text-app transition-colors'}`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>Add Photo/Video</span>
                                <input type="file" multiple accept="image/*,video/*" onChange={handleFileChange} className="hidden" disabled={posting || uploadingImage} />
                            </label>

                            <button
                                type="submit"
                                disabled={(!newPostText.trim() && selectedFiles.length === 0) || posting || uploadingImage}
                                className="bg-app text-white px-6 py-1.5 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-app/80 transition-all"
                            >
                                {posting || uploadingImage ? <Spinner /> : 'Post'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

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
                            <div className="flex-1">
                                <h4 className="text-white font-semibold text-sm">
                                    {post.userDetails?.firstName || post.user?.firstName} {post.userDetails?.lastName || post.user?.lastName}
                                </h4>
                                <p className="text-xs text-gray-400">
                                    {post.createdAt ? dayjs(post.createdAt).format('MMM D, YYYY • h:mm A') : ''}
                                </p>
                            </div>
                            {currentUserId && (post.user?._id === currentUserId || post.user?.id === currentUserId || post.userDetails?._id === currentUserId) && (
                                <button
                                    onClick={() => onDeletePost(post._id)}
                                    className="text-gray-500 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-gray-800/50"
                                    title="Delete post"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <div className="text-gray-200 mb-4 whitespace-pre-wrap text-sm leading-relaxed">
                            {parseMentions(post.description || post.content || post.text || post.body || post.post || post.caption || '', post.mentions || []).map((part: any, idx: number) => (
                                part.type === 'mention' ? (
                                    <span key={idx} className="text-blue-500 font-medium">@{part.name}</span>
                                ) : (
                                    <span key={idx}>{part.content}</span>
                                )
                            ))}
                        </div>

                        {post.media && post.media.length > 0 && (
                            <div className={`grid gap-2 mb-4 rounded-xl overflow-hidden ${post.media.length > 1 ? 'grid-cols-2' : 'grid-cols-1 max-w-lg'}`}>
                                {post.media.map((media: any, idx: number) => (
                                    <div key={idx} className="bg-gray-900 flex items-center justify-center rounded-lg overflow-hidden">
                                        {(media.type === 'image' || !media.type) && (
                                            <img
                                                src={typeof media === 'string' ? media : (media.url || media.fileUrl || media.file)}
                                                alt="Post media"
                                                className="max-h-[350px] w-auto h-auto object-contain cursor-pointer"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-6 pt-3 border-t border-gray-800">
                            <button
                                onClick={() => onLike(post._id, (post.isLiked || post.hasReacted))}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${(post.isLiked || post.hasReacted) ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                            >
                                {(post.isLiked || post.hasReacted) ? <HeartIconSolid className="w-5 h-5" /> : <HeartIconOutline className="w-5 h-5" />}
                                <span>{post.likesCount ?? post.totalReactions?.total ?? post.reactionCounts?.total ?? post.reactions?.likes ?? 0}</span>
                            </button>
                            <div className="flex-1 flex items-center gap-2">
                                <div className="flex-1 relative">
                                    {replyingTo && replyingTo.postId === post._id && (
                                        <div className="absolute -top-6 left-0 text-[10px] text-app flex items-center gap-1">
                                            <ArrowUturnLeftIcon className="w-3 h-3" />
                                            <span>Replying to @{replyingTo.userName}</span>
                                            <button onClick={() => setReplyingTo(null)} className="text-gray-500 hover:text-white ml-1">×</button>
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        placeholder="Write a comment..."
                                        value={newCommentTexts[post._id] || ''}
                                        onChange={(e) => setNewCommentTexts(prev => ({ ...prev, [post._id]: e.target.value }))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit(post._id)}
                                        className="w-full bg-gray-800/50 border-none rounded-lg pl-3 pr-8 py-1 text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-app"
                                    />
                                    <label className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-gray-500 hover:text-app transition-colors">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => handleCommentFileChange(post._id, e)}
                                        />
                                    </label>
                                    {commentImagePreviews[post._id] && (
                                        <div className="absolute bottom-[calc(100%+8px)] left-0 bg-[#2A2A2A] p-1.5 rounded-xl border border-gray-700 shadow-[0_8px_30px_rgb(0,0,0,0.5)] flex items-center gap-2 z-20 group transition-all animate-in slide-in-from-bottom-2 duration-200">
                                            <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-600 shadow-inner">
                                                <img src={commentImagePreviews[post._id]!} alt="Preview" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex flex-col justify-center pr-2">
                                                <p className="text-[10px] text-gray-400 font-medium">Image attached</p>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeCommentImage(post._id); }}
                                                    className="mt-1 flex items-center gap-1 text-[10px] text-red-500 hover:text-red-400 transition-colors font-bold"
                                                >
                                                    <XMarkIcon className="w-3 h-3" />
                                                    Remove
                                                </button>
                                            </div>
                                            <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-[#2A2A2A] border-r border-b border-gray-700 rotate-45" />
                                        </div>
                                    )}
                                </div>
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
                                    {Math.max(
                                        (post.commentsCount ?? post.summary?.totalComments ?? post.commentCount ?? 0),
                                        (comments[post._id]?.length || 0)
                                    )} comments
                                </button>
                            </div>
                        </div>

                        {showComments[post._id] && (
                            <PostComments
                                post={post}
                                comments={comments[post._id]}
                                loading={loadingComments[post._id]}
                                currentUserId={currentUserId}
                                onLikeComment={handleLikeCommentClick}
                                onReply={handleReplyToComment}
                                onDelete={handleDeleteComment}
                                onEditInit={handleEditCommentInit}
                                editingComment={editingComment}
                                onEditSave={handleEditCommentSave}
                                setEditingComment={setEditingComment}
                            />
                        )}
                    </div>
                ))
            )}
        </div>
    )
}
