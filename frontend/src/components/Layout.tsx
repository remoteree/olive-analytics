import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Menu,
  MenuItem,
  Chip,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <ReceiptIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Invoice Intelligence
          </Typography>
          <Button
            color="inherit"
            onClick={() => navigate('/')}
            variant={location.pathname === '/' ? 'outlined' : 'text'}
          >
            Shops
          </Button>
          <Button
            color="inherit"
            onClick={() => navigate('/invoices')}
            variant={location.pathname === '/invoices' ? 'outlined' : 'text'}
          >
            Invoices
          </Button>
          {user?.role === 'admin' && (
            <>
              <Button
                color="inherit"
                onClick={() => navigate('/signup')}
                variant={location.pathname === '/signup' ? 'outlined' : 'text'}
              >
                Create Account
              </Button>
              <Button
                color="inherit"
                onClick={() => navigate('/scan-drive')}
                variant={location.pathname === '/scan-drive' ? 'outlined' : 'text'}
              >
                Scan Drive
              </Button>
            </>
          )}
          <Box sx={{ ml: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={user?.role === 'admin' ? 'Admin' : 'Shop Owner'}
              size="small"
              color="secondary"
            />
            <Button
              color="inherit"
              startIcon={<AccountCircleIcon />}
              onClick={handleMenuOpen}
            >
              {user?.email}
            </Button>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
            >
              <MenuItem onClick={handleLogout}>Logout</MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        {children}
      </Container>
    </Box>
  );
}

