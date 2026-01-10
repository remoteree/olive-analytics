import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { getShops, Shop } from '../api/shops';

export default function ShopsList() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadShops();
  }, []);

  const loadShops = async () => {
    try {
      setLoading(true);
      const data = await getShops();
      setShops(data);
    } catch (err) {
      setError('Failed to load shops');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Shops
      </Typography>
      <Grid container spacing={3} sx={{ mt: 2 }}>
        {shops.map((shop) => (
          <Grid item xs={12} sm={6} md={4} key={shop._id}>
            <Card
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
              onClick={() => navigate(`/shops/${shop.shopId}`)}
            >
              <CardContent>
                <Typography variant="h6">{shop.name}</Typography>
                <Typography color="text.secondary" variant="body2">
                  ID: {shop.shopId}
                </Typography>
                {shop.cohort && (
                  <Typography color="text.secondary" variant="body2">
                    Cohort: {shop.cohort}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
        {shops.length === 0 && (
          <Grid item xs={12}>
            <Alert severity="info">No shops found. Create a shop to get started.</Alert>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}



