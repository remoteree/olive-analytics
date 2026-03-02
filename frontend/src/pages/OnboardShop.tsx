import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Container,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import { onboardShop, OnboardShopRequest } from '../api/shops';
import { useAuth } from '../contexts/AuthContext';

export default function OnboardShop() {
  const { user } = useAuth();
  const [formData, setFormData] = useState<OnboardShopRequest>({
    shopId: '',
    name: '',
    cohort: '',
    storageType: 'google-drive',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadUrl, setUploadUrl] = useState('');
  const [copied, setCopied] = useState(false);

  if (!user || user.role !== 'admin') {
    return <Alert severity="error">Admin access required</Alert>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await onboardShop(formData);
      setUploadUrl(result.uploadUrl);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to onboard shop');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(uploadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>
          Onboard New Shop
        </Typography>

        <Card sx={{ mt: 3 }}>
          <CardContent>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {uploadUrl ? (
              <Box>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Shop onboarded successfully!
                </Alert>
                <Typography variant="h6" gutterBottom>
                  Upload Link
                </Typography>
                <TextField
                  fullWidth
                  value={uploadUrl}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={handleCopy}>
                          {copied ? <Check color="success" /> : <ContentCopy />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ mb: 2 }}
                />
                <Typography variant="body2" color="text.secondary">
                  Share this link with the shop to allow them to upload invoices without signing in.
                </Typography>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setUploadUrl('');
                    setFormData({ shopId: '', name: '', cohort: '', storageType: 'google-drive' });
                  }}
                  sx={{ mt: 2 }}
                >
                  Onboard Another Shop
                </Button>
              </Box>
            ) : (
              <form onSubmit={handleSubmit}>
                <TextField
                  fullWidth
                  label="Shop ID"
                  value={formData.shopId}
                  onChange={(e) => setFormData({ ...formData, shopId: e.target.value })}
                  margin="normal"
                  required
                />
                <TextField
                  fullWidth
                  label="Shop Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  margin="normal"
                  required
                />
                <TextField
                  fullWidth
                  label="Cohort (optional)"
                  value={formData.cohort}
                  onChange={(e) => setFormData({ ...formData, cohort: e.target.value })}
                  margin="normal"
                />
                <FormControl fullWidth margin="normal">
                  <InputLabel>Storage Type</InputLabel>
                  <Select
                    value={formData.storageType}
                    onChange={(e) =>
                      setFormData({ ...formData, storageType: e.target.value as 'google-drive' | 'olive' })
                    }
                  >
                    <MenuItem value="google-drive">Google Drive</MenuItem>
                    <MenuItem value="olive">Olive Storage</MenuItem>
                  </Select>
                </FormControl>
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{ mt: 3 }}
                  disabled={loading}
                >
                  {loading ? 'Onboarding...' : 'Onboard Shop'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
