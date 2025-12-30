import mongoose, { Schema, Document } from 'mongoose';

export interface IShop extends Document {
  shopId: string;
  name: string;
  cohort?: string;
  createdAt: Date;
}

const ShopSchema = new Schema<IShop>({
  shopId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  cohort: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IShop>('Shop', ShopSchema);

