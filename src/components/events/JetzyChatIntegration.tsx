"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { Box, Button, Flex, Spinner, Text } from "@chakra-ui/react"
import { useSession } from "next-auth/react"

interface JetzyChatIntegrationProps {
	eventId: string
	eventName?: string // Optional event name to display in chat
	// Called when the embedded chat reports it has messages (jetzychat-state, matching eventId).
	// Used by the parent to auto-expand the Discussion dropdown.
	onHasMessages?: (eventId: string) => void
}

export default function JetzyChatIntegration({ eventId, eventName, onHasMessages }: JetzyChatIntegrationProps) {
	const { data: session } = useSession()
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [apiToken, setApiToken] = useState<string | null>(null)
	// May this viewer SEND? Read is open to anyone signed in; posting is for confirmed guests, the
	// host and admins (`src/lib/event-chat-access.ts`). The signed `chatAccess` token is what
	// JetzyChat enforces — the iframe url alone can be edited. `undefined` = still checking.
	const [access, setAccess] = useState<{ canPost: boolean; enforced: boolean; chatAccess?: string } | null | undefined>(undefined)

	useEffect(() => {
		if (!eventId || !session?.user?.email) return
		let cancelled = false
		fetch(`/api/events/${eventId}/chat-access`)
			.then((r) => (r.ok ? r.json() : null))
			.then((json) => {
				if (!cancelled) setAccess(json?.data || null)
			})
			// A failed check must not take the chat away: it loads as before, with no token, and
			// JetzyChat decides on its own.
			.catch(() => !cancelled && setAccess(null))
		return () => {
			cancelled = true
		}
	}, [eventId, session?.user?.email])

	// Get token from sessionStorage on mount
	// Also check localStorage as fallback
	useEffect(() => {
		if (typeof window !== 'undefined') {
			try {
				// Try sessionStorage first (primary location)
				let token = sessionStorage.getItem('api_token')
				
				// If not in sessionStorage, try localStorage as fallback
				if (!token && 'localStorage' in window) {
					token = localStorage.getItem('api_token')
				}
				
				if (token) {
					setApiToken(token)
					// Debug: Log token retrieval (only first few chars for security)
					if (process.env.NODE_ENV === 'development') {
						console.log('[JetzyChat Integration] Token retrieved:', token.substring(0, 20) + '...')
					}
				} else {
					if (process.env.NODE_ENV === 'development') {
						console.warn('[JetzyChat Integration] No token found in sessionStorage or localStorage')
						console.warn('[JetzyChat Integration] User may need to login via API endpoint to get token')
					}
				}
			} catch (error) {
				console.error('[JetzyChat Integration] Error accessing storage:', error)
			}
		}
	}, [])

	// Auto-join group logic
	useEffect(() => {
		const autoJoinGroup = async () => {
			if (!eventId || !apiToken) return;
			try {
				// 1. Get the interestId for this event
				const res = await fetch(`/api/events/${eventId}/chat-info`);
				const data = await res.json();
				
				if (data.status && data.data?.interestId) {
					// 2. Automatically join the interest group
					const { JoinInterestApi } = await import("@Jetzy/services/interests/interestsapis");
					await JoinInterestApi({ data: { interestId: data.data.interestId } });
					console.log('[JetzyChat Integration] Automatically joined chat group:', data.data.interestId);
				}
			} catch (err) {
				console.error('[JetzyChat Integration] Failed to auto-join group:', err);
			}
		};

		autoJoinGroup();
	}, [eventId, apiToken]);

	useEffect(() => {
		// Listen for messages from iframe
		const handleMessage = (event: MessageEvent) => {
			// Verify origin for security
			const allowedOrigins = [
				process.env.NEXT_PUBLIC_JETZYCHAT_URL,
				'https://jetzychat.vercel.app',
				// Allow localhost in development
				...(process.env.NODE_ENV === 'development' 
					? ['http://localhost:5174', 'http://localhost:5173', 'http://localhost:3000'] 
					: []),
				// Allow preview deployments
				...(process.env.NEXT_PUBLIC_JETZYCHAT_URL?.includes('vercel.app') 
					? ['https://*.vercel.app'] 
					: [])
			].filter(Boolean) as string[]

			// Check if origin matches allowed origins
			const isAllowedOrigin = allowedOrigins.some(origin => {
				if (origin.includes('*')) {
					// Handle wildcard for preview deployments
					const baseOrigin = origin.replace('*.', '')
					return event.origin.includes(baseOrigin)
				}
				// In development, allow localhost with any port
				if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
					return event.origin.startsWith('http://localhost:') || event.origin.startsWith('https://localhost:')
				}
				return event.origin === origin
			})

			if (!isAllowedOrigin && process.env.NODE_ENV === 'production') {
				console.warn('Message from unauthorized origin:', event.origin)
				return
			}
			
			// In development, log all messages for debugging
			if (process.env.NODE_ENV === 'development') {
				console.log('[JetzyChat] Message received:', event.data, 'from origin:', event.origin)
			}
			
			if (event.data.type === 'jetzychat-ready') {
				setIsLoading(false)
				setError(null)
			}
			
			if (event.data.type === 'jetzychat-error') {
				setError(event.data.message || 'Failed to load chat')
				setIsLoading(false)
			}

			// Chat reports its message state on load and on every count change.
			// Only ever signal expand (never collapse) so a manually-opened panel stays open.
			if (event.data.type === 'jetzychat-state' && event.data.eventId === eventId) {
				if (event.data.hasMessages) onHasMessages?.(eventId)
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [eventId, onHasMessages])

	// Build embed URL
	const jetzyChatUrl = process.env.NEXT_PUBLIC_JETZYCHAT_URL || 'https://jetzychat.vercel.app'
	
	// Debug: Log the URL being used (only in development)
	if (process.env.NODE_ENV === 'development') {
		console.log('[JetzyChat Integration] Using URL:', jetzyChatUrl)
		console.log('[JetzyChat Integration] Env var NEXT_PUBLIC_JETZYCHAT_URL:', process.env.NEXT_PUBLIC_JETZYCHAT_URL || 'NOT SET - using fallback')
	}
	
	// Get user data from session
	// NextAuth session structure: { _id, fullName, email, image, role }
	const userId = (session?.user as any)?._id || (session?.user as any)?.id || session?.user?.email || ''
	const userName = (session?.user as any)?.fullName || (session?.user as any)?.name || 'User'
	const userEmail = session?.user?.email || ''
	const userImage = (session?.user as any)?.image || ''

	// Build URL with parameters using useMemo to ensure it updates when token changes
	const embedUrl = useMemo(() => {
		const url = new URL(`${jetzyChatUrl}/embed`)
		
		// Required parameters (based on error message: eventId, userId, userEmail)
		url.searchParams.set('eventId', eventId) // Use eventId as room/channel identifier
		url.searchParams.set('userId', userId)
		url.searchParams.set('userEmail', userEmail)
		
		// Optional but recommended parameters
		if (userName) {
			url.searchParams.set('userName', userName)
		}
		if (userImage) {
			url.searchParams.set('userImage', userImage)
		}
		// Pass event name so JetzyChat can display it instead of eventId
		if (eventName) {
			url.searchParams.set('eventName', eventName)
		}

		// Who may post — `canPost` for the UI, `chatAccess` (HS256, shared secret) for enforcement.
		if (access?.enforced && access.chatAccess) {
			url.searchParams.set('canPost', access.canPost ? '1' : '0')
			url.searchParams.set('chatAccess', access.chatAccess)
		}

		// Pass JWT token for authentication (if available)
		if (apiToken) {
			url.searchParams.set('token', apiToken)
			// Debug: Log token being passed (only in development)
			if (process.env.NODE_ENV === 'development') {
				console.log('[JetzyChat Integration] Token added to embed URL:', apiToken.substring(0, 20) + '...')
				console.log('[JetzyChat Integration] Full embed URL:', url.toString())
			}
		} else {
			// Debug: Warn if no token (only in development)
			if (process.env.NODE_ENV === 'development') {
				console.warn('[JetzyChat Integration] No token available - token parameter will not be included in URL')
				console.log('[JetzyChat Integration] Embed URL without token:', url.toString())
			}
		}
		
		return url
	}, [jetzyChatUrl, eventId, userId, userEmail, userName, userImage, eventName, apiToken, access])

	// Validate required parameters
	if (!userId || !userEmail) {
		return (
			<Box 
				bg="white" 
				borderRadius="lg" 
				boxShadow="sm" 
				p={8}
				textAlign="center"
			>
				<Text color="red.500" fontSize="lg" mb={2}>
					Missing User Information
				</Text>
				<Text color="gray.600" fontSize="sm">
					Unable to load chat: User ID or email is missing from session.
				</Text>
			</Box>
		)
	}

	// Show error if no user session
	if (!session?.user) {
		return (
			<Box 
				bg="white" 
				borderRadius="lg" 
				boxShadow="sm" 
				p={8}
				textAlign="center"
			>
				<Text color="gray.600" fontSize="lg">
					Please sign in to access the event chat
				</Text>
			</Box>
		)
	}

	const readOnly = !!access?.enforced && !access.canPost

	return (
		<>
		{readOnly && (
			<Flex
				bg="rgba(247,148,50,0.10)"
				border="1px solid #F79432"
				borderRadius="lg"
				px={4}
				py={3}
				mb={3}
				gap={3}
				align={{ base: "stretch", md: "center" }}
				direction={{ base: "column", md: "row" }}
			>
				<Text fontSize="sm" color="white" flex="1">
					You can read the chat. Only guests with a ticket can send messages — book a ticket to join the conversation.
				</Text>
				<Button
					as="a"
					href="#event-tickets"
					size="sm"
					bg="#F79432"
					color="black"
					_hover={{ bg: "#E68422" }}
					flexShrink={0}
				>
					Get tickets
				</Button>
			</Flex>
		)}
		<Box 
			bg="white" 
			borderRadius="lg" 
			boxShadow="sm" 
			position="relative"
			minH="600px"
			overflow="hidden"
		>
			{isLoading && (
				<Box 
					position="absolute" 
					top="50%" 
					left="50%" 
					transform="translate(-50%, -50%)"
					zIndex={10}
					textAlign="center"
					bg="white"
					p={4}
					borderRadius="md"
					boxShadow="md"
				>
					<Spinner size="lg" color="blue.500" thickness="4px" />
					<Text mt={4} color="gray.600" fontSize="md">Loading chat...</Text>
				</Box>
			)}
			
			{error && (
				<Box 
					p={6} 
					color="red.500" 
					textAlign="center"
					bg="red.50"
					borderRadius="md"
					m={4}
				>
					<Text fontWeight="semibold" mb={2}>Error Loading Discussion</Text>
					<Text fontSize="sm">{error}</Text>
				</Box>
			)}

			{/* Held back until the access check answers, so the chat doesn't load twice. */}
			{access !== undefined && <iframe
				ref={iframeRef}
				key={embedUrl.toString()} // Force reload when URL changes (e.g., when token is added)
				src={embedUrl.toString()}
				style={{
					width: '100%',
					height: '600px',
					border: 'none',
					borderRadius: '8px',
				}}
				allow="microphone; camera"
				onLoad={() => {
					// Hide events app loading as soon as iframe loads
					// JetzyChat will show its own loading state inside the iframe
					setIsLoading(false)
				}}
				title="JetzyChat"
			/>}
		</Box>
		</>
	)
}

