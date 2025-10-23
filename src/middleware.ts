import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
	// Allow all origins only in development
	if (process.env.NODE_ENV === "development") {
		const res = NextResponse.next()
		res.headers.set("Access-Control-Allow-Origin", "*")
		res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		return res
	}

	return NextResponse.next()
}

// Only apply to API routes
export const config = {
	matcher: ["/api/:path*"],
}
