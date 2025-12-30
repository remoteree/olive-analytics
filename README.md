# Invoice Intelligence System

A comprehensive system for ingesting, processing, and analyzing auto shop invoices with AI-powered insights and savings recommendations.

## Architecture

- **Frontend**: React + TypeScript + Vite + Material UI
- **Backend**: Node.js + Express + TypeScript
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT-based with role-based access control (admin, shop-owner)
- **Storage**: AWS S3 (durable storage)
- **Intake**: Google Drive (human-auditable)
- **AI**: OpenAI (context classification) + Perplexity (savings recommendations)
- **Worker**: Single-threaded Node.js process for synchronous invoice processing

## Project Structure

```
invoice-intelligence/
├── backend/          # Express API server + worker
│   ├── src/
│   │   ├── config/   # Database configuration
│   │   ├── models/   # Mongoose models (Shop, Supplier, Invoice, Part)
│   │   ├── routes/   # API routes
│   │   ├── services/ # Business logic (S3, Drive, OCR, LLM, etc.)
│   │   └── worker/   # Invoice processing worker
│   └── package.json
├── frontend/         # React application
│   ├── src/
│   │   ├── api/      # API client functions
│   │   ├── components/ # React components
│   │   └── pages/    # Page components
│   └── package.json
└── README.md
```

## Setup

### Backend

1. Navigate to backend directory:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

4. Configure environment variables:

- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens (change in production!)
- `AWS_*`: AWS S3 credentials and bucket name
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google service account key
- `OPENAI_API_KEY`: OpenAI API key for context classification
- `PERPLEXITY_API_KEY`: Perplexity API key for savings recommendations
- `SMTP_*`: Email configuration for sending temporary credentials and password resets
- `FRONTEND_URL`: Frontend URL for email links

5. Create the first admin user:

```bash
tsx src/scripts/createAdmin.ts admin@example.com your-secure-password
```

6. Start API server:

```bash
npm run dev
```

7. Start worker (in separate terminal):

```bash
npm run dev:worker
```

### Frontend

1. Navigate to frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000` and proxies API requests to `http://localhost:3001`.

## Key Features

### Invoice Processing Flow

1. **Intake**: Invoices uploaded via Google Forms → Google Drive
2. **Queue**: Invoice records created in MongoDB with `status: queued`
3. **Processing**: Worker picks up one invoice at a time:
   - Downloads from Google Drive
   - Computes SHA-256 hash (deduplication)
   - Uploads to S3
   - Extracts structured data (OCR)
   - Resolves entities (Shop, Supplier, Parts)
   - Classifies purchase context (LLM)
   - Analyzes trends
   - Generates savings recommendations (Perplexity)
   - Moves file to processed folder
4. **Storage**: All data stored in MongoDB + S3

### State Machine

```
queued → processing → processed
                 ↘ failed
```

- Only one invoice processed at a time (enforced via MongoDB atomic updates)
- Retry logic: up to 3 attempts before marking as failed
- Drive folder movement mirrors DB state

### Authentication & Authorization

The system uses JWT-based authentication with two roles:

- **Admin**: Can create shop owner accounts, view all shops and invoices
- **Shop Owner**: Can only view their own shop and invoices

#### Authentication Endpoints

- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/signup` - Create account (admin only, requires authentication)
- `POST /api/auth/change-password` - Change password (requires authentication)
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `GET /api/auth/me` - Get current user info (requires authentication)

#### Protected API Endpoints

All endpoints below require authentication:

- `GET /api/shops` - List shops (admin sees all, shop-owner sees only their shop)
- `GET /api/shops/:shopId` - Get shop details
- `POST /api/shops` - Create shop (admin only)
- `GET /api/invoices` - List invoices (with optional filters, shop-owner filtered automatically)
- `GET /api/invoices/:invoiceId` - Get invoice details
- `POST /api/invoices/:invoiceId/reprocess` - Manually reprocess invoice
- `GET /api/files/:invoiceId/original-url` - Get presigned S3 URL for original invoice
- `GET /api/admin/users` - List all users (admin only)
- `GET /api/admin/shops` - List all shops (admin only)

### Frontend Screens

- **Login**: Sign in with email and password
- **Forgot Password**: Request password reset link
- **Reset Password**: Reset password with token from email
- **Change Password**: Change password (required for temporary passwords)
- **Create Account**: Create shop owner accounts (admin only)
- **Shops List**: View shops (filtered by role)
- **Shop Detail**: View shop overview, recent invoices, spend trends
- **Invoices List**: View invoices with status filtering (filtered by role)
- **Invoice Detail**: View extracted data, context, trends, recommendations

## MongoDB Models

- **User**: email, password (hashed), role (admin/shop-owner), shopId, isTemporaryPassword, passwordResetToken
- **Shop**: shopId, name, cohort, ownerId (reference to User)
- **Supplier**: normalizedName, aliases, contactInfo
- **Invoice**: Full invoice data with status, processing info, extracted data, context, trends, recommendations
- **Part**: normalizedDesc, sku, category

## Environment Variables

See `backend/.env.example` for required environment variables.

### Google Drive Setup

The system expects invoices to be uploaded to Google Drive with the following structure:

```
Drive/
  Invoices/
    <shopId>/
      unprocessed/  (invoices are uploaded here)
      processed/    (moved here after successful processing)
      failed/       (moved here after max retries)
```

You can configure folder IDs in two ways:

1. **Environment Variables** (recommended for production):

   - `GOOGLE_DRIVE_<SHOPID>_<TYPE>_FOLDER_ID` (e.g., `GOOGLE_DRIVE_SHOP1_PROCESSED_FOLDER_ID`)

2. **Automatic Folder Creation**:
   - Set `GOOGLE_DRIVE_BASE_FOLDER_ID` to your base Drive folder
   - The system will automatically find or create the folder structure

### Creating Test Invoices

To create a test invoice for processing:

```bash
cd backend
tsx src/scripts/createTestInvoice.ts <shopId> [driveFileId]
```

Example:

```bash
tsx src/scripts/createTestInvoice.ts shop1 1a2b3c4d5e6f7g8h9i0j
```

## Authentication Flow

1. **First Admin Setup**: Create the first admin user using the script:

   ```bash
   tsx src/scripts/createAdmin.ts admin@example.com password123
   ```

2. **Creating Shop Owner Accounts**:

   - Admin logs in and navigates to "Create Account"
   - Admin enters email, selects role (shop-owner), and selects a shop
   - System generates temporary password and sends it via email
   - Temporary password is also displayed to admin

3. **Shop Owner Login**:

   - Shop owner logs in with email and temporary password
   - System redirects to change password page
   - Shop owner sets new password
   - Shop owner can now access their shop and invoices

4. **Password Reset**:
   - User clicks "Forgot Password" on login page
   - System sends reset link to email
   - User clicks link and sets new password

## Development Notes

- Worker runs continuously, checking for queued invoices every 5 seconds
- OCR extraction is currently a placeholder - integrate with AWS Textract, Google Cloud Vision, or Tesseract.js
- Email service requires SMTP configuration (Gmail, SendGrid, etc.)
- All API routes except `/api/auth/*` require authentication
- Shop owners are automatically filtered to see only their shop's data

## Production Considerations

- Change `JWT_SECRET` to a strong, random value
- Configure SMTP email service (Gmail, SendGrid, AWS SES, etc.)
- Implement proper error handling and logging
- Add rate limiting to API endpoints
- Set up monitoring and alerting
- Configure CORS properly for production
- Implement actual OCR service integration
- Complete Google Drive folder management
- Set up CI/CD pipeline
- Use HTTPS in production
- Implement session management and token refresh
