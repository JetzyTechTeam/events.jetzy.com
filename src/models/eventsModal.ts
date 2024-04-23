import mongoose, { Schema } from "mongoose"
// Define the  schema
const eventsSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    datetime: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },

    interest: {
      type: Array<String>,
      required: true,
    },

    privacy: {
      type: String,
      required: true,
      enum: {
        values: ["private", "public", "group"],
        message: "Invalid privacy type",
      },
      default: "public",
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    amount: {
      type: Number,
      required: false,
      default: 0,
    },

    desc: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

// Export the user model
export const Events = mongoose.models["Events"] || mongoose.model("Events", eventsSchema)
