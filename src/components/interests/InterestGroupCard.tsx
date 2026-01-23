import React from 'react'
import { UserIcon, MapPinIcon } from '@heroicons/react/24/solid'
import Link from 'next/link'

interface InterestGroupCardProps {
    group: {
        _id: string
        name: string
        description: string
        image: string
        memberCount: number
        type: string
        category?: string
        location?: {
            description?: string
        }
    }
}

export default function InterestGroupCard({ group }: InterestGroupCardProps) {
    const [imageError, setImageError] = React.useState(false)

    return (
        <Link href={`/interests/${group._id}`} className="block group">
            <div className="bg-[#1E1E1E] rounded-2xl overflow-hidden shadow-lg hover:shadow-app/20 transition-all duration-300 hover:-translate-y-1 h-full flex flex-col border border-white/5">
                <div className="relative h-48 w-full overflow-hidden bg-gray-900 flex items-center justify-center">
                    {!imageError && group.image ? (
                        <img
                            src={group.image}
                            alt={group.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-gray-400 group-hover:scale-110 transition-transform duration-500">
                            <span className="text-4xl mb-2 opacity-20">📸</span>
                            <span className="text-[10px] uppercase tracking-widest font-bold opacity-30">No Cover Image</span>
                        </div>
                    )}
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white border border-white/10 uppercase tracking-widest">
                        {group.type}
                    </div>
                </div>

                <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-bold text-app bg-app/10 px-2 py-0.5 rounded uppercase tracking-wider">
                            {group.category || 'General'}
                        </span>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2 line-clamp-1 group-hover:text-app transition-colors">
                        {group.name}
                    </h3>

                    <p className="text-gray-400 text-sm mb-4 line-clamp-2 flex-1">
                        {group.description}
                    </p>

                    <div className="flex items-center justify-between text-xs text-gray-500 mt-auto pt-4 border-t border-gray-800">
                        <div className="flex items-center gap-1.5 font-medium">
                            <UserIcon className="w-3.5 h-3.5 text-app/60" />
                            <span>{group.memberCount || 0} Members</span>
                        </div>
                        {group.location?.description && (
                            <div className="flex items-center gap-1.5 overflow-hidden max-w-[50%]">
                                <MapPinIcon className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                                <span className="truncate">{group.location.description}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Link>
    )
}
