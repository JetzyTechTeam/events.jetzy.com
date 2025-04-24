'use server'
import { Users } from "@/models/userModal";

export async function getUser(email: string) {
  const user = await Users.findOne({ email });
  if (!user) return null;
  return user;
}