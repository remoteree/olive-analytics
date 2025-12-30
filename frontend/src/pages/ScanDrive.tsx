import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useAuth } from '../contexts/AuthContext';
import { startScan, getScans, getScan, DriveScan, ScanStatus } from '../api/scans';
import { getShops, Shop } from '../api/shops';

export default function ScanDrive() {
  const { user } = useAuth();
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [scans, setScans] = useState<DriveScan[]>([]);
  const [selectedScan, setSelectedScan] = useState<DriveScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanDetailsOpen, setScanDetailsOpen] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadShops();
      loadScans();
    }
  }, [user]);

  useEffect(() => {
    // Poll for running scans
    const interval = setInterval(() => {
      const hasRunningScans = scans.some((s) => s.status === 'running' || s.status === 'pending');
      if (hasRunningScans) {
        loadScans();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [scans]);

  const loadShops = async () => {
    try {
      const shopsData = await getShops();
      setShops(shopsData);
    } catch (err) {
      console.error('Failed to load shops:', err);
    }
  };

  const loadScans = async () => {
    try {
      setLoading(true);
      const scansData = await getScans(20);
      setScans(scansData);
    } catch (err: any) {
      setError('Failed to load scans');
    } finally {
      setLoading(false);
    }
  };

  const handleStartScan = async () => {
    try {
      setError(null);
      setScanning(true);
      await startScan(selectedShopId ? { shopId: selectedShopId } : undefined);
      await loadScans();
      setScanDialogOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start scan');
    } finally {
      setScanning(false);
    }
  };

  const handleViewScan = async (scanId: string) => {
    try {
      const scan = await getScan(scanId);
      setSelectedScan(scan);
      setScanDetailsOpen(true);
    } catch (err) {
      setError('Failed to load scan details');
    }
  };

  const getStatusColor = (status: ScanStatus) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'info';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  if (user?.role !== 'admin') {
    return (
      <Alert severity="error">You must be an admin to access this page.</Alert>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Google Drive Scanner</Typography>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={() => setScanDialogOpen(true)}
        >
          Start Scan
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Scans
          </Typography>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : scans.length === 0 ? (
            <Alert severity="info">No scans found. Start a scan to begin.</Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell>Initiated By</TableCell>
                    <TableCell>Shop</TableCell>
                    <TableCell>Started</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Stats</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scans.map((scan) => (
                    <TableRow key={scan._id}>
                      <TableCell>
                        <Chip
                          label={scan.status}
                          color={getStatusColor(scan.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{scan.initiatedBy.email}</TableCell>
                      <TableCell>{scan.shopId || 'All Shops'}</TableCell>
                      <TableCell>
                        {scan.startedAt
                          ? new Date(scan.startedAt).toLocaleString()
                          : 'Pending'}
                      </TableCell>
                      <TableCell>
                        {scan.completedAt && scan.startedAt
                          ? `${Math.round(
                              (new Date(scan.completedAt).getTime() -
                                new Date(scan.startedAt).getTime()) /
                                1000
                            )}s`
                          : scan.status === 'running'
                          ? 'Running...'
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {scan.status === 'completed' ? (
                          <>
                            {scan.stats.newInvoices} new, {scan.stats.existingInvoices}{' '}
                            existing
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          onClick={() => handleViewScan(scan._id)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={scanDialogOpen} onClose={() => setScanDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Start Google Drive Scan</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph>
            Scan Google Drive for new invoices and create processing jobs. Leave shop
            unselected to scan all shops.
          </Typography>
          <FormControl fullWidth margin="normal">
            <InputLabel>Shop (Optional)</InputLabel>
            <Select
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
              label="Shop (Optional)"
            >
              <MenuItem value="">All Shops</MenuItem>
              {shops.map((shop) => (
                <MenuItem key={shop._id} value={shop.shopId}>
                  {shop.name} ({shop.shopId})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScanDialogOpen(false)} disabled={scanning}>
            Cancel
          </Button>
          <Button
            onClick={handleStartScan}
            variant="contained"
            disabled={scanning}
            startIcon={scanning ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          >
            {scanning ? 'Starting...' : 'Start Scan'}
          </Button>
        </DialogActions>
      </Dialog>

      {selectedScan && (
        <Dialog
          open={scanDetailsOpen}
          onClose={() => {
            setScanDetailsOpen(false);
            setSelectedScan(null);
          }}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>
            Scan Details - {selectedScan.status}
            {selectedScan.status === 'running' && (
              <LinearProgress sx={{ mt: 1 }} />
            )}
          </DialogTitle>
          <DialogContent>
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Statistics
              </Typography>
              <Box display="flex" gap={2}>
                <Chip label={`Total: ${selectedScan.stats.totalFound}`} />
                <Chip
                  label={`New: ${selectedScan.stats.newInvoices}`}
                  color="success"
                />
                <Chip
                  label={`Existing: ${selectedScan.stats.existingInvoices}`}
                  color="info"
                />
                <Chip label={`Skipped: ${selectedScan.stats.skipped}`} />
                {selectedScan.stats.errors > 0 && (
                  <Chip
                    label={`Errors: ${selectedScan.stats.errors}`}
                    color="error"
                  />
                )}
              </Box>
            </Box>

            {selectedScan.scannedFiles.length > 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>File Name</TableCell>
                      <TableCell>Shop</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Invoice</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedScan.scannedFiles.map((file, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{file.fileName}</TableCell>
                        <TableCell>{file.shopId}</TableCell>
                        <TableCell>
                          <Chip
                            label={file.status}
                            size="small"
                            color={
                              file.status === 'new'
                                ? 'success'
                                : file.status === 'error'
                                ? 'error'
                                : 'default'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {file.invoiceId ? (
                            <Button
                              size="small"
                              onClick={() =>
                                window.open(`/invoices/${file.invoiceId}`, '_blank')
                              }
                            >
                              View
                            </Button>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {selectedScan.error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {selectedScan.error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setScanDetailsOpen(false);
                setSelectedScan(null);
              }}
            >
              Close
            </Button>
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => {
                if (selectedScan) {
                  handleViewScan(selectedScan._id);
                }
              }}
            >
              Refresh
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}

