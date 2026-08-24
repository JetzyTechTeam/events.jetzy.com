import React from "react"
import Link from "next/link"
import { EyeIcon } from "@heroicons/react/20/solid"

import { exitPreviewPath } from "@/lib/event-preview"

/**
 * The bar shown across the top of an event page opened with `?preview=1`.
 *
 * It is rendered ONLY for a viewer who could otherwise manage the event. Guest mode is a
 * suppression of privileges, so for anyone without them the parameter changes nothing and
 * a bar announcing a "preview" would just be a confusing claim about a page they are
 * seeing normally.
 *
 * Sticky rather than fixed: the page below scrolls under it, but it never covers the
 * banner media on arrival the way a fixed overlay does.
 */
export default function PreviewBanner({ eventId, slugOrId, query }: { eventId: string; slugOrId: string; query?: Record<string, any> }) {
	return (
		<div className="sticky top-0 z-[1000] bg-[#F79432] text-black" data-analytics-ignore="">
			<div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-2">
				<div className="flex items-center gap-2 min-w-0">
					<EyeIcon className="w-5 h-5 flex-shrink-0" />
					<span className="text-sm font-bold">Previewing as a guest</span>
					<span className="hidden sm:inline text-sm opacity-80 truncate">— your host controls are hidden, this is what a visitor sees.</span>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					<Link
						href={`/console/events/${eventId}/manage`}
						className="text-sm font-bold rounded-lg border border-black/40 px-3 py-1 hover:bg-black/10"
					>
						Back to editing
					</Link>
					<Link href={exitPreviewPath(slugOrId, query)} className="text-sm font-bold rounded-lg bg-black text-white px-3 py-1 hover:bg-black/80">
						Exit preview
					</Link>
				</div>
			</div>
		</div>
	)
}
