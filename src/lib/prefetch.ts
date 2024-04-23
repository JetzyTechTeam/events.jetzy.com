// import { ROUTES } from "@JCKConsultant/configs/routes"
// import { getSession } from "next-auth/react"

// export const prefetchConfigs = async (context: any, fetchCourse: boolean = false) => {
// 	const _session = await getSession(context)
// 	let courseData = null

// 	try {
// 		const _data = await FetchConfigs()

// 		/** Fetch course details */
// 		if (fetchCourse) {
// 			const { params } = context
// 			const courseId = params?.courseId
// 			if (courseId) {
// 				const courseRes = await FetchCourse(courseId)
// 				courseData = courseRes?.data
// 			}
// 		}
// 		return {
// 			props: {
// 				session: _session,
// 				configs: _data?.data,
// 				course: courseData
// 			}
// 		}
// 	} catch (error) {
// 		return {
// 			props: {
// 				session: _session,
// 				configs: null,
// 				course: courseData
// 			}
// 		}
// 	}
// }

// export const prefetchConfigsUnauthorizedOnly = async (context: any) => {
// 	const _session = await getSession(context)

// 	if (_session)
// 		return {
// 			redirect: {
// 				destination: ROUTES.user.dashboard,
// 				permanent: false
// 			}
// 		}

// 	try {
// 		const _data = await FetchConfigs()

// 		return {
// 			props: {
// 				session: _session,
// 				configs: _data?.data
// 			}
// 		}
// 	} catch (error) {
// 		return {
// 			props: {
// 				session: _session,
// 				configs: null
// 			}
// 		}
// 	}
// }

// export const prefetchConfigsAuthorizedOnly = async (context: any) => {
// 	const { resolvedUrl } = context
// 	const _session = await getSession(context)

// 	if (!_session)
// 		return {
// 			redirect: {
// 				destination: resolvedUrl && resolvedUrl !== ROUTES.user.signin ? `${ROUTES.user.signin}?callback=${resolvedUrl}` : ROUTES.user.signin,
// 				permanent: false
// 			}
// 		}

// 	try {
// 		const _data = await FetchConfigs()

// 		return {
// 			props: {
// 				session: _session,
// 				configs: _data?.data
// 			}
// 		}
// 	} catch (error) {
// 		return {
// 			props: {
// 				session: _session,
// 				configs: null
// 			}
// 		}
// 	}
// }
