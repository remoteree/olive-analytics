import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  normalizedName: string;
  aliases: string[];
  contactInfo?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  createdAt: Date;
}

const SupplierSchema = new Schema<ISupplier>({
  normalizedName: {
    type: String,
    required: true,
    index: true,
  },
  aliases: {
    type: [String],
    default: [],
  },
  contactInfo: {
    email: String,
    phone: String,
    address: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<ISupplier>('Supplier', SupplierSchema);

