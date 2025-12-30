import client from './client';

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: 'admin' | 'shop-owner';
    shopId?: string;
    isTemporaryPassword: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'shop-owner';
  shopId?: string;
  isTemporaryPassword?: boolean;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const response = await client.post('/auth/login', { email, password });
  return response.data;
};

export const signup = async (email: string, role: string, shopId?: string): Promise<{ message: string; temporaryPassword: string }> => {
  const token = localStorage.getItem('token');
  const response = await client.post(
    '/auth/signup',
    { email, role, shopId },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
};

export const getCurrentUser = async (token: string): Promise<User> => {
  const response = await client.get('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
};

export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const token = localStorage.getItem('token');
  await client.post(
    '/auth/change-password',
    { currentPassword, newPassword },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const forgotPassword = async (email: string): Promise<void> => {
  await client.post('/auth/forgot-password', { email });
};

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  await client.post('/auth/reset-password', { token, newPassword });
};

