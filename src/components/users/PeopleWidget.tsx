import React, { useEffect, useState } from 'react'
import { SearchUsersApi } from '@Jetzy/services/users/userapis'
import Spinner from '@Jetzy/components/misc/Spinner'
import Link from 'next/link'

interface PeopleWidgetProps {
    creator?: any;
    members?: any[];
}

export default function PeopleWidget({ creator, members }: PeopleWidgetProps) {
    console.log('PeopleWidget Props:', { creator, membersCount: members?.length });
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!members) {
            fetchUsers()
        }
    }, [members])

    const fetchUsers = async () => {
        try {
            setLoading(true)
            // Using 'fahad' to ensure we get results based on user feedback
            const res = await SearchUsersApi({ data: { q: 'fahad', limit: 10 } })

            // @ts-ignore
            if ((res.status || res.success) && res.data) {
                let results: any[] = []
                if (Array.isArray(res.data?.users)) {
                    results = res.data.users
                } else if (Array.isArray(res.data)) {
                    results = res.data
                }
                setUsers(results)
            }
        } catch (err) {
            console.error('PeopleWidget Error:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-4 flex justify-center"><Spinner /></div>

    // Use passed members if available, otherwise use fetched users
    const sourceUsers = members || users;

    // Filter creator from users to avoid duplication
    const displayUsers = sourceUsers.filter(u => {
        const userId = u._id || u.userDetails?._id || u.user?._id;
        const creatorId = creator?._id || creator?.id || creator;
        return String(userId) !== String(creatorId);
    });

    return (
        <div className="bg-[#1E1E1E] rounded-xl p-4 shadow-xl mb-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">People</h3>
                <button className="text-app text-sm font-medium hover:underline flex items-center bg-transparent border-none cursor-pointer">
                    View all <span className="ml-1 text-lg">&rsaquo;</span>
                </button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {creator && (
                    <div className="flex flex-col items-center min-w-[80px] w-[80px]">
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-700 mb-2 border-2 border-app ring-2 ring-app/20 transition-all cursor-pointer relative">
                            {creator.image ? (
                                <img src={creator.image} alt={creator.firstName || creator.fullName} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl uppercase bg-app">
                                    {(creator.firstName || creator.fullName || 'A').charAt(0)}
                                </div>
                            )}
                            <div className="absolute bottom-0 right-0 w-4 h-4 bg-app rounded-full border-2 border-[#1E1E1E]" title="Admin" />
                        </div>
                        <p className="text-white text-xs font-bold text-center truncate w-full px-1">
                            {creator.firstName || creator.fullName?.split(' ')[0] || 'Admin'} {creator.lastName ? creator.lastName.charAt(0) + '...' : ''}
                        </p>
                    </div>
                )}

                {displayUsers.length === 0 && !creator ? (
                    <div className="text-gray-500 text-sm py-4 w-full text-center">No people found</div>
                ) : (
                    displayUsers.map((member) => {
                        const firstName = member.firstName || member.userDetails?.firstName || member.user?.firstName || 'U';
                        const lastName = member.lastName || member.userDetails?.lastName || member.user?.lastName || '';
                        const image = member.image || member.userDetails?.image || member.user?.image;
                        const isAdminMember = member.isAdmin || member.role === 'admin' || member.role === 'creator';

                        return (
                            <div key={member._id} className="flex flex-col items-center min-w-[80px] w-[80px]">
                                <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-700 mb-2 border-2 border-transparent hover:border-app transition-all cursor-pointer relative">
                                    {image ? (
                                        <img src={image} alt={firstName} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-xl uppercase bg-gray-600">
                                            {firstName.charAt(0)}
                                        </div>
                                    )}
                                    {isAdminMember && (
                                        <div className="absolute bottom-0 right-0 w-4 h-4 bg-app/80 rounded-full border-2 border-[#1E1E1E]" title="Admin" />
                                    )}
                                </div>
                                <p className="text-white text-xs font-medium text-center truncate w-full px-1">
                                    {firstName} {lastName ? lastName.charAt(0) + '...' : ''}
                                </p>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    )
}
