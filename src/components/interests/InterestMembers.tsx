import React, { useState } from 'react'
import Spinner from '@Jetzy/components/misc/Spinner'
import { UserPlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { GetUsersToInviteApi, InviteMembersApi } from '@Jetzy/services/interests/interestsapis'
import { Success, Error as ToastError } from '@Jetzy/lib/_toaster'

interface InterestMembersProps {
    interestId: string;
    members: any[];
    loading: boolean;
}

export default function InterestMembers({ interestId, members, loading }: InterestMembersProps) {
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
            if (res.status) {
                setSearchResults(res.data.docs || [])
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
            const res = await InviteMembersApi({ data: { interestId, users: [userId], message: "Join our interest group!" } })
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
                        {members.map((member: any) => (
                            <div key={member._id} className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-lg hover:bg-gray-800 transition-colors">
                                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                                    {(member.userDetails?.image || member.user?.image) ? (
                                        <img src={member.userDetails?.image || member.user?.image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                            {(member.userDetails?.firstName || member.user?.firstName || 'M')?.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="overflow-hidden">
                                    <h3 className="text-white font-medium truncate">
                                        {member.userDetails?.firstName || member.user?.firstName} {member.userDetails?.lastName || member.user?.lastName}
                                    </h3>
                                    <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                                </div>
                            </div>
                        ))}
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
