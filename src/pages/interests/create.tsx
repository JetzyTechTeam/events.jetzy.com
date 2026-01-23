import React, { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { GetServerSideProps } from 'next'
import { authorizedOnly } from '@Jetzy/lib/authSession'
import { CreateInterestGroupApi } from '@Jetzy/services/interests/interestsapis'
import { Error as ToastError, Success } from '@Jetzy/lib/_toaster'
import Spinner from '@Jetzy/components/misc/Spinner'
import { ArrowLeftIcon } from '@heroicons/react/24/solid'

export default function CreateInterestGroupPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
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

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)

            const uploadData = new FormData()
            uploadData.append('upload_file', file)
            uploadData.append('folder', 'posts')

            const token = typeof window !== 'undefined' ? sessionStorage.getItem('api_token') : null
            const uploadUrl = 'https://prod-api.jetzy.com/api/v1/uploader/multiple'

            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: uploadData,
            })

            const res = await response.json()

            if (res.status && res.data && res.data.length > 0) {
                const uploadedUrl = res.data[0].fileUrl
                setFormData(prev => ({ ...prev, image: uploadedUrl }))
                Success('Image uploaded successfully')
            } else {
                throw new Error(res.message || 'Upload failed')
            }
        } catch (err: any) {
            console.error('Upload Error:', err)
            ToastError(err?.message || 'Failed to upload image')
        } finally {
            setUploading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            setLoading(true)

            // Sanitize payload
            const payload: any = { ...formData }
            if (payload.dataType === 'group') {
                delete payload.capacity
                delete payload.startDate
                delete payload.endDate
            } else if (payload.dataType === 'activity') {
                payload.capacity = parseInt(payload.capacity)
            }

            const res = await CreateInterestGroupApi({ data: payload })
            if (res.status) {
                Success('Interest Group created successfully')
                router.push(`/interests/${res.data._id}`)
            } else {
                ToastError(res.message || 'Failed to create interest group')
            }
        } catch (err: any) {
            ToastError(err?.message || 'Failed to create interest group')
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
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 group w-fit"
                >
                    <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Back
                </button>

                <h1 className="text-3xl font-bold mb-8">Create New Interest Group</h1>

                <form onSubmit={handleSubmit} className="space-y-6 bg-[#1E1E1E] p-8 rounded-2xl shadow-2xl border border-white/5">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Group Name</label>
                        <input
                            required
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app text-white"
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
                                className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app text-white"
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
                                className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app text-white"
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
                            className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app resize-none text-white"
                            placeholder="Describe what this group is about..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Cover Image</label>
                        <div className="relative">
                            {formData.image ? (
                                <div className="relative h-48 w-full rounded-xl overflow-hidden border border-gray-700 group">
                                    <img src={formData.image} alt="Cover" className="h-full w-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                                            className="text-white bg-red-500 px-4 py-2 rounded-lg text-sm font-medium"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center h-48 w-full rounded-xl border-2 border-dashed border-gray-700 hover:border-app hover:bg-gray-800/50 transition-all cursor-pointer">
                                    {uploading ? (
                                        <Spinner />
                                    ) : (
                                        <>
                                            <div className="p-3 bg-gray-700 rounded-full mb-2">
                                                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <span className="text-sm text-gray-400">Click to upload image</span>
                                        </>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="hidden"
                                        disabled={uploading}
                                    />
                                </label>
                            )}
                        </div>
                        <div className="mt-2">
                            <input
                                name="image"
                                value={formData.image}
                                onChange={handleChange}
                                placeholder="Or paste image URL here..."
                                className="w-full bg-transparent border-b border-gray-800 p-2 text-xs text-gray-500 focus:text-gray-300 outline-none"
                            />
                        </div>
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
                                        className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">End Date</label>
                                    <input
                                        type="datetime-local"
                                        name="endDate"
                                        value={formData.endDate}
                                        onChange={handleChange}
                                        className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app text-white"
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
                                    className="w-full bg-gray-800 border-none rounded-lg p-3 focus:ring-1 focus:ring-app text-white"
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
                            {loading ? <Spinner /> : 'Create Interest Group'}
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
