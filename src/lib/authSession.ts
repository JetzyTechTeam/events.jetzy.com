import { ROUTES } from "@Jetzy/configs/routes"
import { AuthorizedOptions } from "@Jetzy/types"
import { getSession } from "next-auth/react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/pages/api/auth/[...nextauth]"

export const authorizedOnly = async (context: any, options?: AuthorizedOptions) => {
	const { resolvedUrl } = context
	const _session = await getSession(context)

	if (!_session)
		return {
			redirect: {
				// This section hanadles redirecting user to intended url after there are logged in
				destination: resolvedUrl && resolvedUrl !== ROUTES.login ? `${ROUTES.login}?_cb=${resolvedUrl?.toString().replace("/_sites/", "/")?.replace(`${context?.params?.site}/`, "")}` : ROUTES.login,
				permanent: false,
			},
		}

	return {
		props: {
			session: _session,
		},
	}
}

/**
 * Middleware to restrict access to admin and super admin only
 * Regular users will be redirected to the dashboard
 */
export const adminOnly = async (context: any) => {
	const session = await getServerSession(context.req, context.res, authOptions)

	if (!session) {
		return {
			redirect: {
				destination: ROUTES.login,
				permanent: false,
			},
		}
	}

	const userRole = (session.user as any)?.role
	const isAdmin = userRole === "admin" || userRole === "super admin"
	if (!isAdmin) {
		return {
			redirect: {
				destination: ROUTES.dashboard.index || "/",
				permanent: false,
			},
		}
	}

	return {
		props: {
			session,
		},
	}
}

export const unauthorizedOnly = async (context: any) => {
	const _session = await getSession(context)

	if (_session) {
		// Check user role to redirect appropriately
		const userRole = (_session.user as any)?.role
		const isAdmin = userRole === "admin" || userRole === "super admin"

		return {
			redirect: {
				destination: isAdmin ? ROUTES.dashboard.index : ROUTES.home,
				permanent: false,
			},
		}
	}

	try {
		// Fetch site config date
		const _data = null

		return {
			props: {
				session: _session,
				configs: _data,
			},
		}
	} catch (error) {
		return {
			props: {
				session: _session,
				configs: null,
			},
		}
	}
}

export const isAuthorized = async (context: any) => {
	const _session = await getSession(context)

	return _session ? true : false
}
