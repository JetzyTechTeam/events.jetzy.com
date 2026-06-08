import { GetServerSideProps } from "next"

// The standalone update page has been merged into the unified Manage Event page.
// Editing now happens inline on the Overview tab of /console/events/[eventId]/manage.
// This shim keeps old links/bookmarks working by redirecting to manage.
export default function UpdateEventRedirect() {
	return null
}

export const getServerSideProps: GetServerSideProps<any, { eventId: string }> = async (context) => {
	const { eventId } = context.params as { eventId: string }
	return {
		redirect: {
			destination: `/console/events/${eventId}/manage`,
			permanent: false,
		},
	}
}
