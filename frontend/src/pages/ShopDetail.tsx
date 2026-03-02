import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
  IconButton,
  Snackbar,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ContentCopy, Check } from '@mui/icons-material';
import { getShop, Shop, updateShopStorageType, getShopUploadLink } from '../api/shops';
import { getInvoices, Invoice } from '../api/invoices';
import { useAuth } from '../contexts/AuthContext';

export default function ShopDetail() {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [savingStorageType, setSavingStorageType] = useState(false);

  useEffect(() => {
    if (shopId) {
      loadShopData();
    }
  }, [shopId]);

  const loadShopData = async () => {
    try {
      setLoading(true);
      const [shopData, invoicesData] = await Promise.all([
        getShop(shopId!),
        getInvoices({ shopId }),
      ]);
      setShop(shopData);
      setInvoices(invoicesData);
      
      // Load upload link if admin
      if (user?.role === 'admin' && shopData.uploadToken) {
        try {
          const linkData = await getShopUploadLink(shopId!);
          setUploadUrl(linkData.uploadUrl);
        } catch (err) {
          console.error('Failed to load upload link:', err);
        }
      }
    } catch (err) {
      setError('Failed to load shop data');
    } finally {
      setLoading(false);
    }
  };

  const handleStorageTypeChange = async (newStorageType: 'google-drive' | 'olive') => {
    if (!shopId) return;
    
    setSavingStorageType(true);
    try {
      const updatedShop = await updateShopStorageType(shopId, newStorageType);
      setShop(updatedShop);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update storage type');
    } finally {
      setSavingStorageType(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(uploadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'success';
      case 'processing':
        return 'info';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const totalSpend = invoices
    .filter((inv) => inv.status === 'processed' && inv.totals)
    .reduce((sum, inv) => sum + (inv.totals?.total || 0), 0);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !shop) {
    return <Alert severity="error">{error || 'Shop not found'}</Alert>;
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/')}
        sx={{ mb: 2 }}
      >
        Back to Shops
      </Button>

      <Typography variant="h4" gutterBottom>
        {shop.name}
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Overview
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Shop ID: {shop.shopId}
              </Typography>
              {shop.cohort && (
                <Typography variant="body2" color="text.secondary">
                  Cohort: {shop.cohort}
                </Typography>
              )}
              {user?.role === 'admin' && (
                <>
                  <FormControl fullWidth sx={{ mt: 2 }}>
                    <InputLabel>Storage Type</InputLabel>
                    <Select
                      value={shop.storageType || 'google-drive'}
                      onChange={(e) => handleStorageTypeChange(e.target.value as 'google-drive' | 'olive')}
                      disabled={savingStorageType}
                    >
                      <MenuItem value="google-drive">Google Drive</MenuItem>
                      <MenuItem value="olive">Olive Storage</MenuItem>
                    </Select>
                  </FormControl>
                  {uploadUrl && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Upload Link:
                      </Typography>
                      <TextField
                        fullWidth
                        size="small"
                        value={uploadUrl}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton onClick={handleCopy} size="small">
                                {copied ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Box>
                  )}
                </>
              )}
              <Typography variant="h6" sx={{ mt: 2 }}>
                Total Spend: ${totalSpend.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {invoices.filter((inv) => inv.status === 'processed').length} processed invoices
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Invoices
              </Typography>
              {invoices.length === 0 ? (
                <Alert severity="info">No invoices found for this shop.</Alert>
              ) : (
                <Box>
                  {invoices.slice(0, 10).map((invoice) => (
                    <Box
                      key={invoice._id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        py: 1,
                        borderBottom: '1px solid #eee',
                        cursor: 'pointer',
                        '&:hover': { backgroundColor: '#f5f5f5' },
                      }}
                      onClick={() => navigate(`/invoices/${invoice._id}`)}
                    >
                      <Box>
                        <Typography variant="body1">
                          {invoice.invoiceNumber || 'No Invoice #'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {invoice.invoiceDate
                            ? new Date(invoice.invoiceDate).toLocaleDateString()
                            : 'No date'}
                          {' • '}
                          ${invoice.totals?.total?.toFixed(2) || '0.00'}
                        </Typography>
                      </Box>
                      <Chip
                        label={invoice.status}
                        color={getStatusColor(invoice.status) as any}
                        size="small"
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      <Snackbar
        open={copied}
        autoHideDuration={2000}
        message="Upload link copied to clipboard"
      />
    </Box>
  );
}



