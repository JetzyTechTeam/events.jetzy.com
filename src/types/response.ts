import { Roles } from "./const"

export interface UserInterface {
  firstName: string
  lastName: string
  email: string
  password: string
  role: Roles
  _id: string
  _v: number
  createdAt: string
  updatedAt: string
}

export interface EventInterface {
  name: string
  location: string
  desc: string
  interest: string[]
  datetime: string
  privacy: string
  isPaid: boolean
  amount: number
  image: string
  _id: string
  _v: number
  createdAt: string
  updatedAt: string
}
