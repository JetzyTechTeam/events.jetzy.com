import { useEffect, useRef, useState } from "react"

/**
 * One paginated analytics table: owns its page / page size and refetches only itself, so paging
 * the referrers table no longer reloads the entire dashboard behind a full-page spinner.
 *
 * `params` are the table's filters (date range, sort…). Changing any of them returns to page 1
 * in the same request rather than fetching the old page first.
 */
export function usePagedAnalytics<T>(path: string, params: Record<string, string | null | undefined>, initialPageSize = 10) {
	const [data, setData] = useState<T | null>(null)
	const [page, setPage] = useState(1)
	const [pageSize, setPageSize] = useState(initialPageSize)
	const [isLoading, setIsLoading] = useState(true)

	const filterSig = JSON.stringify([path, params, pageSize])
	const lastSig = useRef(filterSig)

	useEffect(() => {
		if (lastSig.current !== filterSig) {
			lastSig.current = filterSig
			if (page !== 1) {
				setPage(1)
				return
			}
		}
		const query = new URLSearchParams({ page: String(page), limit: String(pageSize) })
		Object.entries(params).forEach(([k, v]) => {
			if (v) query.set(k, v)
		})
		const controller = new AbortController()
		setIsLoading(true)
		fetch(`${path}?${query.toString()}`, { credentials: "include", signal: controller.signal })
			.then((r) => (r.ok ? r.json() : null))
			.then((result) => {
				if (result?.status && result.data) setData(result.data)
			})
			.catch((err) => {
				if (err?.name !== "AbortError") console.error(`[Analytics] ${path} failed:`, err)
			})
			.finally(() => {
				if (!controller.signal.aborted) setIsLoading(false)
			})
		return () => controller.abort()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [page, filterSig])

	return { data, page, setPage, pageSize, setPageSize, isLoading }
}
