import { POST } from "@Jetzy/configs/api"
import { CreateJetzyAccountFormData, RequestParams, ServerResponse, SignUpFormData, UserInterface } from "@Jetzy/types"
import { authEndpoints } from "./authendpoints"

export const CreateAccountApi = async (params: RequestParams<SignUpFormData>): Promise<ServerResponse<UserInterface, any>> => {
	return await POST(authEndpoints.signup, params?.data)
}

export const CreateJetzyAccountApi = async (params: RequestParams<CreateJetzyAccountFormData>): Promise<ServerResponse<UserInterface, any>> => {
	return await POST(authEndpoints.createUser, params?.data)
}
