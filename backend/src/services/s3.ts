import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Lazy initialization - only create client when needed
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.');
    }
    
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'laftrax';

export async function uploadToS3(key: string, body: Buffer, contentType?: string): Promise<string> {
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  
  await client.send(command);
  return key;
}

export async function getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  return await getSignedUrl(client, command, { expiresIn });
}

export function getS3Key(shopId: string, invoiceId: string, type: 'original' | 'processed', extension?: string): string {
  if (type === 'processed') {
    return `shops/${shopId}/invoices/${invoiceId}/processed.json`;
  }
  return `shops/${shopId}/invoices/${invoiceId}/original.${extension || 'pdf'}`;
}

