import { Roles, TransactionStatus } from "./const"

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
  externalUrl: string
  _id: string
  slug: string
  _v: number
  createdAt: string
  updatedAt: string
}

export interface TicketInterface {
  firstName: string
  lastName: string
  email: string
  phone: string
  event: string
  _id: string
  isPaid: boolean
  createdAt: string
  updatedAt: string
}

export interface TransactionInterface {
  reference: string
  amount: number
  status: TransactionStatus
  event: string | EventInterface
  ticket: string | TicketInterface
  _id: string
  piSecret: string
  createdAt: string
  updatedAt: string
}

export interface CreateTicketInterfaceResponse {
  ticket: TicketInterface
  transaction: TransactionInterface
  configs: {
    stripe: {
      publishableKey: string
      piSecret: string
    }
  }
}
