import { POST } from "@Jetzy/configs/api"
import { RequestParams, ServerResponse, SignUpFormData, UserInterface } from "@Jetzy/types"
import { authEndpoints } from "./authendpoints"

export const CreateAccountApi = async (params: RequestParams<SignUpFormData>): Promise<ServerResponse<UserInterface, any>> => {
  return await POST(authEndpoints.signup, params?.data)
}
