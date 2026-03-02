import client from './client';

export interface Shop {
  _id: string;
  shopId: string;
  name: string;
  cohort?: string;
  storageType?: 'google-drive' | 'olive';
  uploadToken?: string;
  createdAt: string;
}

export interface OnboardShopRequest {
  shopId: string;
  name: string;
  cohort?: string;
  storageType?: 'google-drive' | 'olive';
}

export interface OnboardShopResponse {
  shop: Shop;
  uploadUrl: string;
  uploadToken: string;
}

export const getShops = async (): Promise<Shop[]> => {
  const response = await client.get('/shops');
  return response.data;
};

export const getShop = async (shopId: string): Promise<Shop> => {
  const response = await client.get(`/shops/${shopId}`);
  return response.data;
};

export const onboardShop = async (data: OnboardShopRequest): Promise<OnboardShopResponse> => {
  const response = await client.post('/admin/shops/onboard', data);
  return response.data;
};

export const updateShopStorageType = async (shopId: string, storageType: 'google-drive' | 'olive'): Promise<Shop> => {
  const response = await client.put(`/admin/shops/${shopId}/storage-type`, { storageType });
  return response.data;
};

export const getShopUploadLink = async (shopId: string): Promise<{ uploadUrl: string; uploadToken: string }> => {
  const response = await client.get(`/admin/shops/${shopId}/upload-link`);
  return response.data;
};



