// Fallback image when host doesn't upload one (kept in sync with mobile backend default)
export const DEFAULT_EVENT_IMAGE =
	"https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=60&blur=80"

export enum Pages {
	Dasshboard = "Dashboard",
	Events = "Events",
	Bookings = "Bookings",
	Manage = 'Manage Event',
	CreateEvent = 'Create Event',
	Analytics = "Analytics",
}

export enum Roles {
	USER = "user",
	ADMIN = "admin",
}

export enum EventPrivacy {
	PUBLIC = "public",
	PRIVATE = "private",
	GROUP = "group",
}

export enum TransactionStatus {
	PENDING = "pending",
	SUCCESS = "success",
	FAILED = "failed",
	RESERVED = "reserved",
}
