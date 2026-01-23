import React, { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { ListInterestsApi } from '@Jetzy/services/interests/interestsapis'
import InterestGroupCard from '@Jetzy/components/interests/InterestGroupCard'
import Spinner from '@Jetzy/components/misc/Spinner'
import { Error } from '@Jetzy/lib/_toaster'

export default function InterestsListingPage() {
    const [interests, setInterests] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [search, setSearch] = useState('')
    const [activeCategory, setActiveCategory] = useState('All')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const LIMIT = 10

    const categories = ['All', 'Travel', 'Food', 'Technology', 'Photography', 'Sports', 'Music', 'Business', 'Art']

    useEffect(() => {
        handleResetAndFetch()
    }, [activeCategory])

    const handleResetAndFetch = () => {
        setPage(1)
        setInterests([])
        fetchInterests(search, 1, true)
    }

    const fetchInterests = async (searchQuery = search, pageNum = 1, isInitial = false) => {
        try {
            if (isInitial) setLoading(true)
            else setLoadingMore(true)

            const params: any = {
                page: pageNum,
                limit: LIMIT
            }
            if (activeCategory !== 'All') params.category = activeCategory
            if (searchQuery) params.search = searchQuery

            const res = await ListInterestsApi({ data: params })
            if (res.status && res.data) {
                const fetchedInterests = res.data.interests || res.data.docs || (Array.isArray(res.data) ? res.data : [])

                if (isInitial) {
                    setInterests(fetchedInterests)
                } else {
                    setInterests(prev => [...prev, ...fetchedInterests])
                }

                // Check pagination meta from API
                const meta = res.data.pagination || {}
                setHasMore(meta.nextPage !== null && fetchedInterests.length > 0)
                setPage(pageNum)
            }
        } catch (err) {
            console.error(err)
            Error('Failed to load interest groups')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }

    const loadMore = () => {
        if (!loadingMore && hasMore) {
            fetchInterests(search, page + 1)
        }
    }

    const observerTarget = useRef(null)

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    loadMore()
                }
            },
            { threshold: 1.0 }
        )

        if (observerTarget.current) {
            observer.observe(observerTarget.current)
        }

        return () => observer.disconnect()
    }, [hasMore, loadingMore, loading, page])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        handleResetAndFetch()
    }

    return (
        <div className="min-h-screen bg-black text-white pb-20">
            <Head>
                <title>Interest Groups | Jetzy</title>
            </Head>

            {/* Header Section */}
            <div className="bg-gradient-to-b from-app/10 to-transparent pt-16 pb-12 px-4">
                <div className="max-w-7xl mx-auto text-center">
                    <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-white via-white to-gray-500 bg-clip-text text-transparent">
                        Discover Your Tribe
                    </h1>
                    <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10">
                        Join communities that share your passions. From travel buffs to foodies, find where you belong.
                    </p>

                    <div className="flex flex-col md:flex-row items-center justify-center gap-4 max-w-4xl mx-auto">
                        <form onSubmit={handleSearch} className="relative w-full md:flex-1 group">
                            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-app transition-colors" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search groups, interests, activities..."
                                className="w-full bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-app/50 focus:border-app transition-all text-white shadow-2xl"
                            />
                        </form>

                        <Link
                            href="/interests/create"
                            className="w-full md:w-auto flex items-center justify-center gap-2 bg-app hover:bg-app/90 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg shadow-app/20 hover:-translate-y-0.5"
                        >
                            <PlusIcon className="w-5 h-5" />
                            Create Group
                        </Link>
                    </div>
                </div>
            </div>

            {/* Categories & Filter */}
            <div className="max-w-7xl mx-auto px-4 mb-12">
                <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`whitespace-nowrap px-6 py-2.5 rounded-full text-sm font-semibold transition-all border ${activeCategory === cat
                                ? 'bg-white text-black border-white shadow-xl scale-105'
                                : 'bg-gray-900/50 text-gray-400 border-white/5 hover:border-white/20 hover:text-white'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Section */}
            <div className="max-w-7xl mx-auto px-4">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Spinner />
                    </div>
                ) : interests.length > 0 ? (
                    <div className="space-y-12">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {interests.map((group) => (
                                <InterestGroupCard key={group._id} group={group} />
                            ))}
                        </div>

                        {/* Infinite Scroll Sentinel */}
                        <div ref={observerTarget} className="h-10 w-full flex justify-center items-center">
                            {loadingMore && <Spinner />}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-20 bg-[#111] rounded-3xl border border-white/5 shadow-inner">
                        <div className="text-6xl mb-4 opacity-20">🌍</div>
                        <h3 className="text-2xl font-bold text-white mb-2">No groups found</h3>
                        <p className="text-gray-500">Try adjusting your filters or search terms.</p>
                        <button
                            onClick={() => { setActiveCategory('All'); setSearch(''); fetchInterests('') }}
                            className="mt-6 text-app font-bold hover:underline"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
