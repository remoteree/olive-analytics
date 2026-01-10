import mongoose, { Schema, Document } from 'mongoose';

export interface IPart extends Document {
  normalizedDesc: string;
  sku?: string;
  category?: string;
  createdAt: Date;
}

const PartSchema = new Schema<IPart>({
  normalizedDesc: {
    type: String,
    required: true,
    index: true,
  },
  sku: {
    type: String,
    index: true,
  },
  category: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IPart>('Part', PartSchema);



