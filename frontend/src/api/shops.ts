import client from './client';

export interface Shop {
  _id: string;
  shopId: string;
  name: string;
  cohort?: string;
  createdAt: string;
}

export const getShops = async (): Promise<Shop[]> => {
  const response = await client.get('/shops');
  return response.data;
};

export const getShop = async (shopId: string): Promise<Shop> => {
  const response = await client.get(`/shops/${shopId}`);
  return response.data;
};



