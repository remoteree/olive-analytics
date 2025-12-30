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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getShop, Shop } from '../api/shops';
import { getInvoices, Invoice } from '../api/invoices';

export default function ShopDetail() {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const [shop, setShop] = useState<Shop | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setError('Failed to load shop data');
    } finally {
      setLoading(false);
    }
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
    </Box>
  );
}

