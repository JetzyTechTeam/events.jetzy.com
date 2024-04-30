import mongoose, { Schema } from "mongoose"
// Define the  schema
const transactionSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Events",
      required: true,
    },

    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tickets",
      required: true,
    },

    status: {
      type: String,
      required: true,
      enum: {
        values: ["pending", "completed", "failed", "reserved"],
        message: "Invalid status type",
      },
      default: "pending",
    },

    piSecret: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
)

// Export the user model
export const Transactions = mongoose.models["Transactions"] || mongoose.model("Transactions", transactionSchema)
