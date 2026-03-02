import mongoose, { Schema, Document } from 'mongoose';

export type StorageType = 'google-drive' | 'olive';

export interface IShop extends Document {
  shopId: string;
  name: string;
  cohort?: string;
  ownerId?: mongoose.Types.ObjectId; // Reference to User
  storageType?: StorageType; // 'google-drive' or 'olive'
  uploadToken?: string; // Token for public upload link
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
  storageType: {
    type: String,
    enum: ['google-drive', 'olive'],
    default: 'google-drive',
  },
  uploadToken: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IShop>('Shop', ShopSchema);

