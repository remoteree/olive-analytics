import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
} from '@mui/material';
import ReceiptIcon from '@mui/icons-material/Receipt';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

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
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, flexGrow: 1 }}>
        {children}
      </Container>
    </Box>
  );
}

