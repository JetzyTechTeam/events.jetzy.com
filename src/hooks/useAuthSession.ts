import { UserResponseInterface } from "@JB/types"
import { useSession } from "next-auth/react"

/**
 * Get the current user session
 */
export const useAuthSession = (withToken: boolean = false): UserResponseInterface | { accessToken: string; user: UserResponseInterface } | null => {
  const session = useSession()

  if (session?.data) {
    if (withToken) {
      // @ts-ignore
      return session.data?.user ?? session?.data?.profile
    } else {
      // @ts-ignore
      return session.data?.user?.user ?? session?.data?.profile?.user
    }
  }

  return null
}
