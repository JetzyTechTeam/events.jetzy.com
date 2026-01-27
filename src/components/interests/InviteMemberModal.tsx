import React, { useState } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { GetUsersToInviteApi, InviteMembersApi } from '@Jetzy/services/interests/interestsapis'
import { Success, Error as ToastError } from '@Jetzy/lib/_toaster'
import Spinner from '@Jetzy/components/misc/Spinner'

interface InviteMemberModalProps {
    interestId: string;
    onClose: () => void;
}

export default function InviteMemberModal({ interestId, onClose }: InviteMemberModalProps) {
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

            let users: any[] = []
            // @ts-ignore
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
            } else if (Array.isArray(responseData?.users)) {
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
            // @ts-ignore
            if (res.status) {
                Success('Invitation sent')
                setSearchResults(prev => prev.map(u => u._id === userId ? { ...u, isInvited: true } : u))
            }
        } catch (err) {
            ToastError('Failed to send invitation')
        } finally {
            setInvitingIds(prev => prev.filter(id => id !== userId))
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-[#1E1E1E] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">Invite People</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <div className="p-6 space-y-6">
                    <form onSubmit={handleSearch} className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name or email..."
                            className="w-full bg-gray-900 border-none rounded-xl pl-10 pr-4 py-3 text-white focus:ring-1 focus:ring-app"
                            autoFocus
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
    )
}
