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
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import CancelIcon from '@mui/icons-material/Cancel';
import { getInvoice, reprocessInvoice, cancelProcessing, getOriginalInvoiceUrl, Invoice, RecommendationSummary } from '../api/invoices';

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

  const calculateRecommendationSummary = (): RecommendationSummary | null => {
    if (!invoice || invoice.recommendations.length === 0) {
      return null;
    }

    const invoiceTotal = invoice.totals?.total || 0;
    if (invoiceTotal === 0) return null;

    let totalMinSavings = 0;
    let totalMaxSavings = 0;
    let totalMinPercent = 0;
    let totalMaxPercent = 0;
    const allActionSteps: string[] = [];

    invoice.recommendations.forEach(rec => {
      if (rec.savingsRange) {
        totalMinSavings += rec.savingsRange.min;
        totalMaxSavings += rec.savingsRange.max;
      } else if (rec.potentialSavings) {
        const estimatedSavings = rec.potentialSavings;
        totalMinSavings += estimatedSavings * 0.8;
        totalMaxSavings += estimatedSavings * 1.2;
      }

      if (rec.savingsPercentRange) {
        totalMinPercent += rec.savingsPercentRange.min;
        totalMaxPercent += rec.savingsPercentRange.max;
      } else if (rec.potentialSavings && invoiceTotal > 0) {
        const percent = (rec.potentialSavings / invoiceTotal) * 100;
        totalMinPercent += percent * 0.8;
        totalMaxPercent += percent * 1.2;
      }

      if (rec.actionSteps && Array.isArray(rec.actionSteps)) {
        allActionSteps.push(...rec.actionSteps);
      }
    });

    totalMaxPercent = Math.min(totalMaxPercent, 100);

    return {
      totalSavingsRange: { min: totalMinSavings, max: totalMaxSavings },
      totalSavingsPercentRange: { min: totalMinPercent, max: totalMaxPercent },
      estimatedTotalSavings: (totalMinSavings + totalMaxSavings) / 2,
      estimatedTotalSavingsPercent: (totalMinPercent + totalMaxPercent) / 2,
      combinedActionSteps: Array.from(new Set(allActionSteps)),
      recommendationCount: invoice.recommendations.length,
    };
  };

  const summary = calculateRecommendationSummary();

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
            <>
              {summary && (
                <Card sx={{ mb: 3 }} elevation={3}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom color="success.main">
                      Savings Summary
                    </Typography>
                    <Box mb={2}>
                      <Typography variant="h4" color="success.main" gutterBottom>
                        ${summary.estimatedTotalSavings.toFixed(2)}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        Estimated Savings ({summary.estimatedTotalSavingsPercent.toFixed(1)}%)
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Range: ${summary.totalSavingsRange.min.toFixed(2)} - ${summary.totalSavingsRange.max.toFixed(2)} 
                        ({summary.totalSavingsPercentRange.min.toFixed(1)}% - {summary.totalSavingsPercentRange.max.toFixed(1)}%)
                      </Typography>
                    </Box>
                    {summary.combinedActionSteps.length > 0 && (
                      <Box mt={2}>
                        <Typography variant="subtitle2" gutterBottom>
                          Action Steps to Achieve Savings:
                        </Typography>
                        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                          {summary.combinedActionSteps.map((step, idx) => (
                            <li key={idx}>
                              <Typography variant="body2">{step}</Typography>
                            </li>
                          ))}
                        </ul>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Savings Recommendations ({invoice.recommendations.length})
                  </Typography>
                  {invoice.recommendations.map((rec, idx) => (
                    <Card key={idx} variant="outlined" sx={{ mb: 2 }}>
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                          <Box flex={1}>
                            <Typography variant="subtitle1">{rec.title}</Typography>
                            {rec.estimatedTimeToImplement && (
                              <Typography variant="caption" color="text.secondary">
                                Estimated time: {rec.estimatedTimeToImplement}
                              </Typography>
                            )}
                          </Box>
                          <Box>
                            {rec.savingsRange ? (
                              <Box textAlign="right">
                                <Chip
                                  label={`$${rec.savingsRange.min.toFixed(0)}-$${rec.savingsRange.max.toFixed(0)}`}
                                  color="success"
                                  size="small"
                                  sx={{ mb: 0.5, display: 'block' }}
                                />
                                {rec.savingsPercentRange && (
                                  <Typography variant="caption" color="text.secondary">
                                    {rec.savingsPercentRange.min.toFixed(0)}-{rec.savingsPercentRange.max.toFixed(0)}%
                                  </Typography>
                                )}
                              </Box>
                            ) : rec.potentialSavings ? (
                              <Chip
                                label={`Save $${rec.potentialSavings.toFixed(2)}`}
                                color="success"
                                size="small"
                              />
                            ) : null}
                          </Box>
                        </Box>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          {rec.description}
                        </Typography>
                        {rec.actionSteps && rec.actionSteps.length > 0 && (
                          <Box mb={1}>
                            <Typography variant="caption" fontWeight="bold">
                              Action Steps:
                            </Typography>
                            <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                              {rec.actionSteps.map((step, sIdx) => (
                                <li key={sIdx}>
                                  <Typography variant="caption">{step}</Typography>
                                </li>
                              ))}
                            </ul>
                          </Box>
                        )}
                        {rec.evidence.length > 0 && (
                          <Box mb={1}>
                            <Typography variant="caption" fontWeight="bold">
                              Evidence:
                            </Typography>
                            <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
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
            </>
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

