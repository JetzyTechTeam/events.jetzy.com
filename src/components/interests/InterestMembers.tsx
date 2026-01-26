import React, { useState } from 'react'
import Spinner from '@Jetzy/components/misc/Spinner'
import { UserPlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { GetUsersToInviteApi, InviteMembersApi } from '@Jetzy/services/interests/interestsapis'
import { Success, Error as ToastError } from '@Jetzy/lib/_toaster'

interface InterestMembersProps {
    interestId: string;
    members: any[];
    loading: boolean;
    creator?: any;
    isAdmin?: boolean;
    onRemoveMember?: (userId: string) => void;
}

export default function InterestMembers({ interestId, members, loading, creator, isAdmin, onRemoveMember }: InterestMembersProps) {
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [invitingIds, setInvitingIds] = useState<string[]>([])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!searchQuery.trim()) return
        try {
            setSearching(true)
            const res = await GetUsersToInviteApi({ data: { interestId, query: searchQuery } })
            console.log("Search invite response:", res)

            let users: any[] = []

            const responseData = res as any
            if (Array.isArray(responseData)) {
                users = responseData
            } else if (Array.isArray(responseData?.data)) {
                users = responseData.data
            } else if (Array.isArray(responseData?.data?.docs)) {
                users = responseData.data.docs
            } else if (Array.isArray(responseData?.data?.users)) {
                users = responseData.data.users
            } else if (Array.isArray(responseData?.docs)) {
                users = responseData.docs
            } else if (Array.isArray(responseData?.users)) { // Some APIs return { users: [] }
                users = responseData.users
            }

            if (users) {
                setSearchResults(users)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSearching(false)
        }
    }

    const handleInvite = async (userId: string) => {
        try {
            setInvitingIds(prev => [...prev, userId])
            const res = await InviteMembersApi({ data: { interestId, userId, message: "Join our interest group!" } })
            if (res.status) {
                Success('Invitation sent')
                // Update local state to show invited
                setSearchResults(prev => prev.map(u => u._id === userId ? { ...u, isInvited: true } : u))
            }
        } catch (err) {
            ToastError('Failed to send invitation')
        } finally {
            setInvitingIds(prev => prev.filter(id => id !== userId))
        }
    }

    if (loading && members.length === 0) {
        return (
            <div className="flex justify-center p-10">
                <Spinner />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-white">Members</h2>
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 bg-app/10 text-app px-4 py-2 rounded-lg hover:bg-app hover:text-white transition-all font-medium border border-app/20"
                    >
                        <UserPlusIcon className="w-5 h-5" />
                        Invite Members
                    </button>
                </div>

                {members.length === 0 ? (
                    <div className="text-center text-gray-500 py-10">
                        No members found. Be the first to join!
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {creator && (
                            <div className="flex items-center gap-3 bg-app/10 border border-app/30 p-3 rounded-lg hover:bg-app/20 transition-colors">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0 ring-2 ring-app/50">
                                    {creator.image ? (
                                        <img src={creator.image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold bg-app">
                                            {(creator.firstName || 'A').charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="overflow-hidden">
                                    <h3 className="text-white font-medium truncate">
                                        {creator.firstName} {creator.lastName}
                                    </h3>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] bg-app text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">Admin</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        {members.filter((m: any) => {
                            const memberId = m._id || m.userDetails?._id || m.user?._id;
                            const creatorId = creator?._id || creator?.id || creator;
                            return String(memberId) !== String(creatorId);
                        }).map((member: any) => {
                            const memberId = member.user?._id || member.user?.id || member.userDetails?._id || member.userDetails?.id || member._id;
                            const firstName = member.firstName || member.userDetails?.firstName || member.user?.firstName || 'M';
                            const lastName = member.lastName || member.userDetails?.lastName || member.user?.lastName || '';
                            const image = member.image || member.userDetails?.image || member.user?.image;
                            const isAdminMember = member.isAdmin || member.role === 'admin' || member.role === 'creator';
                            const role = member.role || (isAdminMember ? 'Admin' : 'Member');

                            return (
                                <div key={memberId} className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg hover:bg-gray-800 transition-colors group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                                            {image ? (
                                                <img src={image} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white font-bold bg-gray-600">
                                                    {firstName.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="overflow-hidden">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-white font-medium truncate">
                                                    {firstName} {lastName}
                                                </h3>
                                                {isAdminMember && (
                                                    <span className="text-[8px] bg-app/20 text-app px-1 rounded-sm font-bold uppercase border border-app/30">Admin</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400 capitalize">{role}</p>
                                        </div>
                                    </div>

                                    {isAdmin && !isAdminMember && (
                                        <button
                                            onClick={() => onRemoveMember && onRemoveMember(memberId)}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                                            title="Remove Member"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Simple Invite Modal Overlay */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1E1E1E] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-white">Invite People</h3>
                            <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-white">✕</button>
                        </div>

                        <div className="p-6 space-y-6">
                            <form onSubmit={handleSearch} className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by name or email..."
                                    className="w-full bg-gray-900 border-none rounded-xl pl-10 pr-4 py-3 text-white focus:ring-1 focus:ring-app"
                                />
                            </form>

                            <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-700">
                                {searching ? (
                                    <div className="flex justify-center p-4"><Spinner /></div>
                                ) : searchResults.length === 0 ? (
                                    <div className="text-center text-gray-500 py-4">Search for users to invite</div>
                                ) : (
                                    searchResults.map((user: any) => (
                                        <div key={user._id} className="flex items-center justify-between bg-gray-900/50 p-3 rounded-xl border border-gray-800">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gray-700 overflow-hidden">
                                                    {user.image && <img src={user.image} alt="" className="w-full h-full object-cover" />}
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium text-sm">{user.firstName} {user.lastName}</p>
                                                    <p className="text-xs text-gray-500">{user.email}</p>
                                                </div>
                                            </div>
                                            <button
                                                disabled={user.isMember || user.isInvited || invitingIds.includes(user._id)}
                                                onClick={() => handleInvite(user._id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${user.isMember ? 'bg-gray-700 text-gray-400' :
                                                    user.isInvited ? 'bg-green-500/10 text-green-500' :
                                                        'bg-app text-white hover:bg-app/80'
                                                    }`}
                                            >
                                                {invitingIds.includes(user._id) ? <Spinner /> :
                                                    user.isMember ? 'Member' :
                                                        user.isInvited ? 'Invited' : 'Invite'}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
