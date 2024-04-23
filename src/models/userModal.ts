import mongoose, { Schema } from "mongoose"
// Define the user schema
const usersSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
    },

    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      required: true,
      enum: {
        values: ["user", "admin"],
        message: "Invalid status type",
      },
      default: "user",
    },
  },
  { timestamps: true }
)

// Export the user model
export const Users = mongoose.models["Users"] || mongoose.model("Users", usersSchema)
