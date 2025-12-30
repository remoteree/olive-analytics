import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getShops } from '../api/shops';
import { Shop } from '../api/shops';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'shop-owner'>('shop-owner');
  const [shopId, setShopId] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successDialog, setSuccessDialog] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const { signup, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Only admins can access this page
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }

    // Load shops for shop-owner selection
    loadShops();
  }, [user, navigate]);

  const loadShops = async () => {
    try {
      const shopsData = await getShops();
      setShops(shopsData);
    } catch (err) {
      console.error('Failed to load shops:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (role === 'shop-owner' && !shopId) {
      setError('Please select a shop for shop-owner role');
      return;
    }

    setLoading(true);

    try {
      const result = await signup(email, role, role === 'shop-owner' ? shopId : undefined);
      setTemporaryPassword(result.temporaryPassword);
      setSuccessDialog(true);
      // Reset form
      setEmail('');
      setRole('shop-owner');
      setShopId('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h1" gutterBottom>
              Create Account
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
              />
              <FormControl fullWidth margin="normal">
                <InputLabel>Role</InputLabel>
                <Select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'shop-owner')}>
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="shop-owner">Shop Owner</MenuItem>
                </Select>
              </FormControl>
              {role === 'shop-owner' && (
                <FormControl fullWidth margin="normal">
                  <InputLabel>Shop</InputLabel>
                  <Select value={shopId} onChange={(e) => setShopId(e.target.value)} required>
                    <MenuItem value="">Select a shop</MenuItem>
                    {shops.map((shop) => (
                      <MenuItem key={shop._id} value={shop.shopId}>
                        {shop.name} ({shop.shopId})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </Box>

      <Dialog open={successDialog} onClose={() => setSuccessDialog(false)}>
        <DialogTitle>Account Created Successfully</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Account created for {email}. Temporary password:
          </DialogContentText>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="h6" align="center" fontFamily="monospace">
              {temporaryPassword}
            </Typography>
          </Box>
          <DialogContentText sx={{ mt: 2 }}>
            This password has been sent to the user's email. They will be required to change it on first login.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuccessDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

