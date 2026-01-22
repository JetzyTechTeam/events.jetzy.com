import React, { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { GetServerSideProps } from 'next'
import { authorizedOnly } from '@Jetzy/lib/authSession'
import { CreateInterestGroupApi } from '@Jetzy/services/interests/interestsapis'
import { Error, Success } from '@Jetzy/lib/_toaster'
import Spinner from '@Jetzy/components/misc/Spinner'
import { ArrowLeftIcon } from '@heroicons/react/24/solid'

export default function CreateInterestGroupPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        type: 'public',
        dataType: 'group',
        description: '',
        image: '',
        capacity: 0,
        // For activity
        startDate: '',
        endDate: '',
        location: {
            lat: 0,
            lng: 0,
            description: ''
        }
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setLoading(true)
            const res = await CreateInterestGroupApi({ data: formData })
            if (res.status) {
                Success('Interest Group created successfully')
                router.push(`/interests/${res.data._id}`)
            }
        } catch (err) {
            Error('Failed to create interest group')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-black text-white pb-20">
            <Head>
                <title>Create Interest Group | Jetzy</title>
            </Head>

            <div className="max-w-3xl mx-auto px-4 pt-10">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
                >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back
                </button>

                <h1 className="text-3xl font-bold mb-8">Create New Interest Group</h1>

                <form onSubmit={handleSubmit} className="space-y-6 bg-[#1E1E1E] p-8 rounded-2xl shadow-2xl">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Group Name</label>
                        <input
                            required
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                            placeholder="e.g. Photography Lovers"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Privacy Type</label>
                            <select
                                name="type"
                                value={formData.type}
                                onChange={handleChange}
                                className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                            >
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Data Type</label>
                            <select
                                name="dataType"
                                value={formData.dataType}
                                onChange={handleChange}
                                className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                            >
                                <option value="group">Group</option>
                                <option value="activity">Activity</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={4}
                            className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app resize-none"
                            placeholder="Describe what this group is about..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Cover Image URL</label>
                        <input
                            name="image"
                            value={formData.image}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                            placeholder="https://example.com/image.jpg"
                        />
                    </div>

                    {formData.dataType === 'activity' && (
                        <div className="space-y-4 pt-4 border-t border-gray-700">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">Start Date</label>
                                    <input
                                        type="datetime-local"
                                        name="startDate"
                                        value={formData.startDate}
                                        onChange={handleChange}
                                        className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">End Date</label>
                                    <input
                                        type="datetime-local"
                                        name="endDate"
                                        value={formData.endDate}
                                        onChange={handleChange}
                                        className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Capacity</label>
                                <input
                                    type="number"
                                    name="capacity"
                                    value={formData.capacity}
                                    onChange={handleChange}
                                    className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app"
                                    placeholder="20"
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-6">
                        <button
                            type="submit"
                            disabled={loading || !formData.name}
                            className="w-full bg-app text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-app/20 hover:bg-app/80 transition-all disabled:opacity-50"
                        >
                            {loading ? <Spinner /> : 'Create Group'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export const getServerSideProps: GetServerSideProps<any, any> = async (context) => {
    return authorizedOnly(context)
}
