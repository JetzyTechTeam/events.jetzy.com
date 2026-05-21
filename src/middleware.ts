import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ALLOWED_ORIGINS = [
	"http://localhost:5173",
	"https://jetzy-web-chat.vercel.app",
	"https://jetzy-web-chat-prod.vercel.app",
]

function applyCors(res: NextResponse, allow: string, isDev: boolean) {
	res.headers.set("Access-Control-Allow-Origin", allow)
	res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	if (!isDev) res.headers.set("Vary", "Origin")
}

export function middleware(req: NextRequest) {
	const origin = req.headers.get("origin") || ""
	const isDev = process.env.NODE_ENV === "development"
	const allow = isDev ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : "")

	if (req.method === "OPTIONS") {
		const res = new NextResponse(null, { status: 204 })
		if (allow) {
			applyCors(res, allow, isDev)
			res.headers.set("Access-Control-Max-Age", "86400")
		}
		return res
	}

	const res = NextResponse.next()
	if (allow) applyCors(res, allow, isDev)
	return res
}

export const config = {
	matcher: ["/api/:path*"],
}
