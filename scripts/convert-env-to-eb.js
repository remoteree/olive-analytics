const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '../backend/.env');
if (!fs.existsSync(envPath)) {
  console.error('Error: backend/.env file not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

// Parse environment variables
const envVars = {};
lines.forEach((line) => {
  line = line.trim();
  // Skip empty lines and comments
  if (!line || line.startsWith('#')) {
    return;
  }
  
  // Handle KEY=VALUE format
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let value = match[2].trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    // Handle multi-line JSON values (for GOOGLE_APPLICATION_CREDENTIALS)
    if (value.startsWith('{') && !value.endsWith('}')) {
      // This is a multi-line JSON, we need to read until we find the closing brace
      // For now, we'll handle it as a single-line JSON (user should format it correctly)
      console.warn(`Warning: ${key} appears to be multi-line. Ensure it's on a single line in .env`);
    }
    
    envVars[key] = value;
  }
});

// Create .ebextensions directory if it doesn't exist
const ebextensionsPath = path.join(__dirname, '../backend/.ebextensions');
if (!fs.existsSync(ebextensionsPath)) {
  fs.mkdirSync(ebextensionsPath, { recursive: true });
}

// Create environment.config file for Elastic Beanstalk
const envConfig = {
  option_settings: [
    {
      namespace: 'aws:elasticbeanstalk:application:environment',
      option_name: 'NODE_ENV',
      value: 'production',
    },
  ],
};

// Add all environment variables
Object.keys(envVars).forEach((key) => {
  envConfig.option_settings.push({
    namespace: 'aws:elasticbeanstalk:application:environment',
    option_name: key,
    value: envVars[key],
  });
});

// Write environment configuration
const envConfigPath = path.join(ebextensionsPath, 'environment.config');
fs.writeFileSync(
  envConfigPath,
  JSON.stringify(envConfig, null, 2),
  'utf8'
);

console.log(`✓ Created ${envConfigPath}`);
console.log(`✓ Configured ${Object.keys(envVars).length} environment variables`);

// Also create a Procfile for Elastic Beanstalk
const procfilePath = path.join(__dirname, '../backend/Procfile');
const procfileContent = 'web: NODE_ENV=production node dist/index.js';
fs.writeFileSync(procfilePath, procfileContent, 'utf8');
console.log(`✓ Created ${procfilePath}`);

// Note: Worker process should be deployed separately or run as a separate EB environment
// For now, only web process is included. To add worker:
// Option 1: Deploy worker as separate EB environment
// Option 2: Use EB worker tier
// Option 3: Run worker via cron or separate process manager
