import { GET, POST } from "@Jetzy/configs/api"
import { CreateJetzyAccountFormData, RequestParams, ServerResponse, SignUpFormData, UserInterface } from "@Jetzy/types"
import { authEndpoints } from "./authendpoints"

export const CreateAccountApi = async (params: RequestParams<SignUpFormData>): Promise<ServerResponse<UserInterface, any>> => {
	return await POST(authEndpoints.signup, params?.data)
}

export const CreateJetzyAccountApi = async (params: RequestParams<CreateJetzyAccountFormData>): Promise<ServerResponse<UserInterface, any>> => {
	return await POST(authEndpoints.createUser, params?.data)
}

export interface SSOPayload {
	name: string
	email: string
	image: string
	token: string
	platform: "web"
}

export const AuthorizeSSOApi = async (params: RequestParams<SSOPayload>): Promise<ServerResponse<UserInterface, any>> => {
	return await POST(authEndpoints.ssoAuthorize, params?.data)
}

export const SignupSSOApi = async (params: RequestParams<SSOPayload>): Promise<ServerResponse<UserInterface, any>> => {
	return await POST(authEndpoints.ssoSignup, params?.data)
}

// Optional invite/referral gate. Code in URL path, no body, no auth. 200 => valid.
export const VerifyReferralCodeApi = async (code: string): Promise<boolean> => {
	try {
		await GET(`${authEndpoints.referralVerify}/${encodeURIComponent(code)}`)
		return true
	} catch {
		return false
	}
}
