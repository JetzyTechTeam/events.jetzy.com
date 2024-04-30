import mongoose, { Schema } from "mongoose"
// Define the  schema
const eventTicketsSchema = new Schema(
  {
    ticketId: {
      type: String,
      required: true,
    },
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
    },
    phone: {
      type: String,
      required: false,
    },

    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Events",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      default: 1,
    },

    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  { timestamps: true }
)

// Export the user model
export const Tickets = mongoose.models["Tickets"] || mongoose.model("Tickets", eventTicketsSchema)
