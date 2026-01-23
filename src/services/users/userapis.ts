import { GET } from "@Jetzy/configs/api"
import { RequestParams, ServerResponse } from "@Jetzy/types"
import { userEndPoints } from "./userendpoints"

export const SearchUsersApi = async (params: RequestParams<{ q: string; limit?: number; offset?: number; verified?: boolean }>): Promise<ServerResponse<any, any>> => {
    let url = userEndPoints.search + "?"
    if (params.data) {
        const q = new URLSearchParams(params.data as any).toString()
        url += q
    }
    return await GET(url)
}
