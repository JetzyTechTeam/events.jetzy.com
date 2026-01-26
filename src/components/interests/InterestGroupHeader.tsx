import React from 'react'
import Image from 'next/image'
import { CheckCircleIcon, UserGroupIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/solid'

interface InterestGroupHeaderProps {
    interest: any;
    onJoin: () => void;
    onLeave: () => void;
    loading: boolean;
    memberCount?: number;
}

export default function InterestGroupHeader({ interest, onJoin, onLeave, loading, memberCount }: InterestGroupHeaderProps) {
    // Simply trust the parent's `isMember` calculation which now includes locking and list checking
    // The parent passes `interest` with an overridden `isMember` property
    const isMember = interest?.isMember === true;

    return (
        <div className="relative bg-[#1E1E1E] rounded-xl overflow-hidden mb-6 shadow-2xl">
            {/* Cover Image Background with Blur */}
            <div className="absolute inset-0 h-48 sm:h-64 w-full">
                <div className="absolute inset-0 bg-gradient-to-t from-[#1E1E1E] to-transparent z-10" />
                {interest?.image || interest?.coverImage ? (
                    <img
                        src={interest.image || interest.coverImage}
                        alt={interest.name}
                        className="w-full h-full object-cover opacity-60"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-r from-purple-900 to-blue-900" />
                )}
            </div>

            <div className="relative z-20 px-6 pt-32 pb-6 sm:px-10 flex flex-col sm:flex-row items-end sm:items-center gap-6">
                {/* Profile Image */}
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border-4 border-[#1E1E1E] overflow-hidden shadow-lg bg-gray-800 flex-shrink-0">
                    {interest?.image || interest?.coverImage ? (
                        <img
                            src={interest.image || interest.coverImage}
                            alt={interest.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-700 text-3xl font-bold text-gray-400">
                            {interest?.name?.charAt(0)}
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 mb-2 sm:mb-0">
                    <h1 className="text-3xl font-bold text-white mb-1 shadow-sm">{interest?.name}</h1>
                    <p className="text-gray-300 text-sm mb-3 max-w-2xl line-clamp-2">{interest?.description}</p>

                    <div className="flex items-center gap-4 text-sm text-gray-400">
                        <div className="flex items-center gap-1 bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                            <UserGroupIcon className="w-4 h-4 text-app" />
                            <span>{memberCount ?? interest?.memberCount ?? 0} Members</span>
                        </div>
                        <div className="flex items-center gap-1 bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">
                            <span className={`w-2 h-2 rounded-full ${interest?.type === 'public' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                            <span className="capitalize">{interest?.type || 'Public'} Group</span>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <div className="flex-shrink-0 w-full sm:w-auto mt-4 sm:mt-0">
                    {isMember ? (
                        <button
                            onClick={onLeave}
                            disabled={loading}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all disabled:opacity-50 border border-gray-600"
                        >
                            <MinusIcon className="w-5 h-5" />
                            Leave Group
                        </button>
                    ) : (
                        <button
                            onClick={onJoin}
                            disabled={loading}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-app hover:bg-app/80 text-white rounded-lg font-semibold shadow-lg shadow-app/20 transition-all disabled:opacity-50 transform hover:scale-105"
                        >
                            <PlusIcon className="w-5 h-5" />
                            Join Group
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
