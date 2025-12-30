import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'invoice-intelligence';

export async function uploadToS3(key: string, body: Buffer, contentType?: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  
  await s3Client.send(command);
  return key;
}

export async function getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn });
}

export function getS3Key(shopId: string, invoiceId: string, type: 'original' | 'processed', extension?: string): string {
  if (type === 'processed') {
    return `shops/${shopId}/invoices/${invoiceId}/processed.json`;
  }
  return `shops/${shopId}/invoices/${invoiceId}/original.${extension || 'pdf'}`;
}

