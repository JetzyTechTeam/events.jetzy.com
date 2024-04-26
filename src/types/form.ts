import { EventPrivacy } from "./const"

export type SignUpFormData = {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword?: string
}

export type SignInFormData = {
  email: string
  password: string
}

export type CreateEventFormData = {
  name: string
  datetime: string
  location: string
  interest: string
  privacy: EventPrivacy
  isPaid: boolean
  amount: string
  desc: string
  externalUrl?: string
  image: string
}
