# Deployment Guide for Elastic Beanstalk

This guide explains how to deploy the Invoice Intelligence application to AWS Elastic Beanstalk.

## Prerequisites

1. AWS CLI installed and configured
2. Elastic Beanstalk CLI (eb-cli) installed (optional, but recommended)
3. Node.js and npm installed locally
4. All environment variables configured in `backend/.env`

## Quick Deploy

Run the deployment script:

```bash
./deploy.sh
```

This will:
1. Build the frontend (outputs to `backend/frontend-dist/`)
2. Build the backend TypeScript code
3. Convert `.env` variables to Elastic Beanstalk configuration
4. Create a ZIP file ready for deployment

## Manual Deployment Steps

### 1. Prepare Environment Variables

Ensure your `backend/.env` file contains all required variables:

```env
MONGODB_URI=mongodb://...
JWT_SECRET=your-secret
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket
GOOGLE_APPLICATION_CREDENTIALS={"type":"service_account",...}
GOOGLE_DRIVE_BASE_FOLDER_ID=...
OPENAI_API_KEY=...
PERPLEXITY_API_KEY=...
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
FRONTEND_URL=https://your-domain.com
PORT=8080
NODE_ENV=production
```

**Important**: For `GOOGLE_APPLICATION_CREDENTIALS`, ensure the JSON is on a single line in the `.env` file.

### 2. Run Deployment Script

```bash
./deploy.sh
```

This creates a ZIP file: `invoice-intelligence-deploy-YYYYMMDD-HHMMSS.zip`

### 3. Deploy to Elastic Beanstalk

#### Option A: Using AWS Console

1. Go to AWS Elastic Beanstalk Console
2. Select your application and environment
3. Click "Upload and Deploy"
4. Upload the ZIP file created by the script
5. Click "Deploy"

#### Option B: Using AWS CLI

```bash
aws elasticbeanstalk create-application-version \
  --application-name invoice-intelligence \
  --version-label v$(date +%Y%m%d-%H%M%S) \
  --source-bundle S3Bucket=your-bucket,S3Key=invoice-intelligence-deploy-*.zip

aws elasticbeanstalk update-environment \
  --application-name invoice-intelligence \
  --environment-name invoice-intelligence-prod \
  --version-label v$(date +%Y%m%d-%H%M%S)
```

#### Option C: Using EB CLI

```bash
eb init
eb create invoice-intelligence-prod
eb deploy
```

## Environment Variables

The deployment script automatically converts your `.env` file to Elastic Beanstalk environment variables via `.ebextensions/environment.config`. 

All variables from `.env` are automatically set in the Elastic Beanstalk environment, so you don't need to manually configure them in the AWS Console.

## Application Structure

The deployed package includes:

- `dist/` - Compiled backend TypeScript code
- `frontend-dist/` - Built frontend React application
- `node_modules/` - Production dependencies
- `.ebextensions/` - Elastic Beanstalk configuration
- `Procfile` - Process definitions (web and worker)
- `package.json` - Node.js dependencies

## Process Management

The application runs two processes:

1. **Web**: Serves the API and frontend (port 8080)
2. **Worker**: Processes invoices in the background

Both are defined in `Procfile` and will be started automatically by Elastic Beanstalk.

## Troubleshooting

### Environment Variables Not Loading

- Check `.ebextensions/environment.config` was generated correctly
- Verify the ZIP file includes `.ebextensions/` directory
- Check Elastic Beanstalk environment configuration in AWS Console

### Frontend Not Loading

- Verify `frontend-dist/` directory is included in the ZIP
- Check that `NODE_ENV=production` is set
- Review application logs: `eb logs`

### Build Failures

- Ensure all dependencies are in `package.json` (not just `devDependencies`)
- Check that TypeScript compilation succeeds: `npm run build`
- Verify frontend build completes: `cd frontend && npm run build`

## Updating Environment Variables

To update environment variables:

1. Edit `backend/.env`
2. Run `./deploy.sh` again
3. Redeploy the new ZIP file

Or manually update in AWS Console:
- Elastic Beanstalk → Configuration → Software → Environment properties

## Health Check

The application exposes a health check endpoint at `/health` that Elastic Beanstalk uses to verify the application is running.

## Worker Process

The worker process runs separately and processes queued invoices. Ensure your Elastic Beanstalk environment has sufficient resources to run both web and worker processes.

## Security Notes

- Never commit `.env` files to version control
- Use AWS Secrets Manager or Parameter Store for sensitive values in production
- Rotate API keys and credentials regularly
- Enable HTTPS in Elastic Beanstalk configuration


