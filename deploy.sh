#!/bin/bash

set -e

echo "🚀 Starting deployment preparation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ Error: backend/.env file not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found .env file"

# Step 1: Build frontend
echo -e "\n${YELLOW}Step 1: Building frontend...${NC}"
cd frontend
npm install
npm run build
cd ..
echo -e "${GREEN}✓${NC} Frontend built successfully"

# Step 2: Build backend
echo -e "\n${YELLOW}Step 2: Building backend...${NC}"
cd backend
npm install
npm run build
cd ..
echo -e "${GREEN}✓${NC} Backend built successfully"

# Step 3: Create Elastic Beanstalk configuration directory
echo -e "\n${YELLOW}Step 3: Creating Elastic Beanstalk configuration...${NC}"
mkdir -p backend/.ebextensions

# Step 4: Convert .env to Elastic Beanstalk environment variables
echo -e "\n${YELLOW}Step 4: Converting .env to Elastic Beanstalk format...${NC}"
node scripts/convert-env-to-eb.js
echo -e "${GREEN}✓${NC} Environment variables converted"

# Step 5: Create deployment package
echo -e "\n${YELLOW}Step 5: Creating deployment package...${NC}"
DEPLOY_DIR="deploy-package"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy backend files
cp -r backend/dist $DEPLOY_DIR/
cp -r backend/node_modules $DEPLOY_DIR/
cp backend/package.json $DEPLOY_DIR/
cp backend/package-lock.json $DEPLOY_DIR/
cp backend/tsconfig.json $DEPLOY_DIR/

# Copy frontend build
cp -r backend/frontend-dist $DEPLOY_DIR/

# Copy Elastic Beanstalk configuration
cp -r backend/.ebextensions $DEPLOY_DIR/

# Do NOT copy Procfile - Elastic Beanstalk will use npm start from package.json instead
# This ensures Elastic Beanstalk uses the "start" script defined in package.json

# Create .npmrc to ensure production installs
echo "production=true" > $DEPLOY_DIR/.npmrc

# Step 6: Create ZIP file
echo -e "\n${YELLOW}Step 6: Creating ZIP archive...${NC}"
ZIP_NAME="invoice-intelligence-deploy-$(date +%Y%m%d-%H%M%S).zip"
cd $DEPLOY_DIR
zip -r ../$ZIP_NAME . -x "*.git*" "*.DS_Store" "node_modules/.cache/*"
cd ..
echo -e "${GREEN}✓${NC} Created deployment package: ${GREEN}$ZIP_NAME${NC}"

# Cleanup
echo -e "\n${YELLOW}Cleaning up...${NC}"
rm -rf $DEPLOY_DIR
echo -e "${GREEN}✓${NC} Cleanup complete"

echo -e "\n${GREEN}✅ Deployment package ready!${NC}"
echo -e "Upload ${GREEN}$ZIP_NAME${NC} to Elastic Beanstalk"
echo -e "\nTo deploy:"
echo -e "  aws elasticbeanstalk create-application-version \\"
echo -e "    --application-name invoice-intelligence \\"
echo -e "    --version-label v$(date +%Y%m%d-%H%M%S) \\"
echo -e "    --source-bundle S3Bucket=your-bucket,S3Key=$ZIP_NAME"
echo ""
