import mongoose, { Schema, Document } from 'mongoose';

export interface IShop extends Document {
  shopId: string;
  name: string;
  cohort?: string;
  ownerId?: mongoose.Types.ObjectId; // Reference to User
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
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IShop>('Shop', ShopSchema);

