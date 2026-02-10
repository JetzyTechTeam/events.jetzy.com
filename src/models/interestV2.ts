import { Document, Model, Schema } from "mongoose";
import { dbconn } from "@/configs/database";
import { UserInterface } from "@/types";

export interface InterestI extends Document {
    name: string;
    type: "public" | "private";
    description: string;
    image: string;
    createdBy: Schema.Types.ObjectId | UserInterface;
    status: "active" | "pending" | "deleted";
    createdAt: Date;
    updatedAt: Date;
    dataType: "group" | "activity";
    location?: {
        description?: string;
        lat?: number;
        lng?: number;
    };
    startDate?: Date;
    endDate?: Date;
    price?: number;
    capacity?: number;
    interests?: Schema.Types.ObjectId[];
    eventId?: Schema.Types.ObjectId;
}

const InterestSchema = new Schema<InterestI>(
    {
        name: { type: String, required: true },
        type: { type: String, enum: ["public", "private"], required: true },
        description: { type: String, required: false },
        image: { type: String, required: false },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Users",
            required: true
        },
        status: { type: String, enum: ["active", "pending", "deleted"], default: "pending" },
        dataType: { type: String, enum: ["group", "activity"], default: "group" },
        location: {
            description: { type: String },
            lat: { type: Number },
            lng: { type: Number },
        },
        startDate: { type: Date },
        endDate: { type: Date },
        price: { type: Number },
        capacity: { type: Number },
        interests: [{
            type: Schema.Types.ObjectId,
            ref: "InterestSubCategories",
        }],
        eventId: {
            type: Schema.Types.ObjectId,
            ref: "Events",
        },
    },
    {
        timestamps: true,
    }
);

InterestSchema.index({ dataType: 1 });
InterestSchema.index({ "location.lat": 1, "location.lng": 1 }, { sparse: true });

const InterestV2model: Model<InterestI> = dbconn.models["InterestV2"] || dbconn.model<InterestI>("InterestV2", InterestSchema, "interests-v2");

export default InterestV2model;
