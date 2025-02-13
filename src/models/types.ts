import { Types } from "mongoose"

export interface IBaseModelProps {
	_id: Types.ObjectId
	isDeleted: boolean
	createdAt: string
	updatedAt: string
}
