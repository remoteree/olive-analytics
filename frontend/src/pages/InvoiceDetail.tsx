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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CancelIcon from '@mui/icons-material/Cancel';
import { getInvoice, reprocessInvoice, cancelProcessing, getOriginalInvoiceUrl, Invoice } from '../api/invoices';

export default function InvoiceDetail() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (invoiceId) {
      loadInvoice();
    }
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      const data = await getInvoice(invoiceId!);
      setInvoice(data);
      
      // Load original invoice URL if available
      if (data.originalS3Key) {
        try {
          const url = await getOriginalInvoiceUrl(invoiceId!);
          setOriginalUrl(url);
        } catch (err) {
          console.error('Failed to load original URL:', err);
        }
      }
    } catch (err) {
      setError('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleReprocess = async () => {
    if (!invoiceId) return;
    
    try {
      setReprocessing(true);
      await reprocessInvoice(invoiceId);
      await loadInvoice(); // Reload to show updated status
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reprocess invoice');
    } finally {
      setReprocessing(false);
    }
  };

  const handleCancel = async () => {
    if (!invoiceId) return;
    
    if (!window.confirm('Are you sure you want to cancel processing? The invoice will be requeued.')) {
      return;
    }
    
    try {
      setCancelling(true);
      await cancelProcessing(invoiceId);
      await loadInvoice(); // Reload to show updated status
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cancel invoice processing');
    } finally {
      setCancelling(false);
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

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !invoice) {
    return <Alert severity="error">{error || 'Invoice not found'}</Alert>;
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/invoices')}
        sx={{ mb: 2 }}
      >
        Back to Invoices
      </Button>

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">
          Invoice {invoice.invoiceNumber || invoice._id}
        </Typography>
        <Box>
          <Chip
            label={invoice.status}
            color={getStatusColor(invoice.status) as any}
            sx={{ mr: 1 }}
          />
          {invoice.status === 'processing' && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<CancelIcon />}
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Processing'}
            </Button>
          )}
          {(invoice.status === 'failed' || invoice.status === 'processed') && (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleReprocess}
              disabled={reprocessing}
            >
              {reprocessing ? 'Reprocessing...' : 'Reprocess'}
            </Button>
          )}
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Line Items
              </Typography>
              {invoice.lineItems.length === 0 ? (
                <Alert severity="info">No line items extracted.</Alert>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Description</TableCell>
                        <TableCell>SKU</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Unit Price</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {invoice.lineItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.sku || 'N/A'}</TableCell>
                          <TableCell align="right">{item.quantity}</TableCell>
                          <TableCell align="right">${item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell align="right">${item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {invoice.totals && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Totals
                </Typography>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>Subtotal:</Typography>
                  <Typography>${invoice.totals.subtotal.toFixed(2)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>Tax:</Typography>
                  <Typography>${invoice.totals.tax.toFixed(2)}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography>Shipping:</Typography>
                  <Typography>${invoice.totals.shipping.toFixed(2)}</Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6">${invoice.totals.total.toFixed(2)}</Typography>
                </Box>
              </CardContent>
            </Card>
          )}

          {invoice.recommendations.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Savings Recommendations
                </Typography>
                {invoice.recommendations.map((rec, idx) => (
                  <Card key={idx} variant="outlined" sx={{ mb: 2 }}>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="subtitle1">{rec.title}</Typography>
                        {rec.potentialSavings && (
                          <Chip
                            label={`Save $${rec.potentialSavings.toFixed(2)}`}
                            color="success"
                            size="small"
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {rec.description}
                      </Typography>
                      {rec.evidence.length > 0 && (
                        <Box>
                          <Typography variant="caption" fontWeight="bold">
                            Evidence:
                          </Typography>
                          <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                            {rec.evidence.map((evidence, eIdx) => (
                              <li key={eIdx}>
                                <Typography variant="caption">{evidence}</Typography>
                              </li>
                            ))}
                          </ul>
                        </Box>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        Confidence: {(rec.confidence * 100).toFixed(0)}%
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          )}
        </Grid>

        <Grid item xs={12} md={4}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Details
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Shop ID: {invoice.shopId}
              </Typography>
              {invoice.invoiceDate && (
                <Typography variant="body2" color="text.secondary">
                  Date: {new Date(invoice.invoiceDate).toLocaleDateString()}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Status: {invoice.status}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Stage: {invoice.processing.stage}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Attempts: {invoice.processing.attempts}
              </Typography>
              {originalUrl && (
                <Button
                  variant="outlined"
                  fullWidth
                  sx={{ mt: 2 }}
                  onClick={() => window.open(originalUrl, '_blank')}
                >
                  View Original Invoice
                </Button>
              )}
            </CardContent>
          </Card>

          {invoice.context && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Purchase Context
                </Typography>
                <Chip
                  label={invoice.context.purchaseType}
                  color="primary"
                  sx={{ mb: 1 }}
                />
                <Typography variant="body2" paragraph>
                  {invoice.context.explanation}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Confidence: {(invoice.context.confidence * 100).toFixed(0)}%
                </Typography>
              </CardContent>
            </Card>
          )}

          {invoice.trendAnalysis && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Trend Analysis
                </Typography>
                {invoice.trendAnalysis.priceChangePercent !== undefined && (
                  <Typography variant="body2">
                    Price Change: {invoice.trendAnalysis.priceChangePercent > 0 ? '+' : ''}
                    {invoice.trendAnalysis.priceChangePercent.toFixed(1)}%
                  </Typography>
                )}
                {invoice.trendAnalysis.anomalies && invoice.trendAnalysis.anomalies.length > 0 && (
                  <Box mt={1}>
                    <Typography variant="subtitle2">Anomalies:</Typography>
                    <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                      {invoice.trendAnalysis.anomalies.map((anomaly, idx) => (
                        <li key={idx}>
                          <Typography variant="caption">{anomaly}</Typography>
                        </li>
                      ))}
                    </ul>
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {invoice.processing.lastError && (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Alert severity="error">
                  <Typography variant="subtitle2">Last Error:</Typography>
                  <Typography variant="body2">{invoice.processing.lastError}</Typography>
                </Alert>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

