import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
  Alert,
  Container,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { CheckCircle, CameraAlt, InsertPhoto, FlipCameraIos } from '@mui/icons-material';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

// Detect if device is mobile
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
};

export default function UploadInvoice() {
  const { token } = useParams<{ token: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [shopName, setShopName] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment'); // Default to back camera on mobile
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const startCamera = async (initialFacingMode?: 'user' | 'environment') => {
    try {
      const mobile = isMobile();
      // On mobile, default to back camera (environment), on desktop use front (user)
      const defaultFacingMode = initialFacingMode || (mobile ? 'environment' : 'user');
      setFacingMode(defaultFacingMode);
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: defaultFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      
      setCameraOpen(true);
      setStream(mediaStream);
      
      // Set stream directly after a brief delay to ensure dialog is rendered
      setTimeout(() => {
        if (videoRef.current && mediaStream) {
          const video = videoRef.current;
          video.srcObject = mediaStream;
          video.play().catch((err) => {
            console.error('Error playing video:', err);
          });
        }
      }, 200);
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found. Please use "Choose File" instead.');
      } else {
        setError('Unable to access camera. Please check permissions or choose a file instead.');
      }
    }
  };

  const flipCamera = async () => {
    // Stop current stream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    
    // Switch facing mode
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // Start new stream with flipped camera
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      
      setStream(mediaStream);
      
      // Update video element
      setTimeout(() => {
        if (videoRef.current && mediaStream) {
          const video = videoRef.current;
          video.srcObject = mediaStream;
          video.play().catch((err) => {
            console.error('Error playing video:', err);
          });
        }
      }, 100);
    } catch (err: any) {
      console.error('Error flipping camera:', err);
      setError('Unable to switch camera. Please try again.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        
        // Convert canvas to blob, then to File
        canvas.toBlob((blob) => {
          if (blob) {
            const fileName = `invoice-${Date.now()}.jpg`;
            const capturedFile = new File([blob], fileName, { type: 'image/jpeg' });
            setFile(capturedFile);
            stopCamera();
            setError('');
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  // Ensure video stream is set when dialog opens
  useEffect(() => {
    if (cameraOpen && stream) {
      // Small delay to ensure Dialog is fully rendered
      const timer = setTimeout(() => {
        if (videoRef.current) {
          const video = videoRef.current;
          console.log('Setting video stream, video element:', video);
          video.srcObject = stream;
          
          // Wait for video metadata to load before playing
          const handleLoadedMetadata = () => {
            console.log('Video metadata loaded, playing...');
            video.play().catch((err) => {
              console.error('Error playing video:', err);
              setError('Unable to start camera preview');
            });
          };
          
          const handleCanPlay = () => {
            console.log('Video can play');
          };
          
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
          video.addEventListener('canplay', handleCanPlay);
          
          // Also try playing immediately
          video.play().catch((err) => {
            console.error('Error playing video immediately:', err);
            // Don't set error here, wait for loadedmetadata
          });
        } else {
          console.warn('Video ref not available');
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
        // Cleanup event listeners
        if (videoRef.current) {
          const video = videoRef.current;
          video.removeEventListener('loadedmetadata', () => {});
          video.removeEventListener('canplay', () => {});
        }
      };
    }
  }, [cameraOpen, stream]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const handleUpload = async () => {
    if (!file || !token) {
      setError('Please select a file');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(`${API_BASE_URL}/upload/${token}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setShopName(response.data.shopName);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload invoice');
    } finally {
      setUploading(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Upload Successful!
          </Typography>
          <Typography variant="body1" color="text.secondary" gutterBottom>
            Your invoice has been uploaded successfully for {shopName}.
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              setSuccess(false);
              setFile(null);
            }}
            sx={{ mt: 3 }}
          >
            Upload Another Invoice
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8 }}>
        <Card>
          <CardContent>
            <Typography variant="h4" gutterBottom align="center">
              Upload Invoice
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ mt: 3 }}>
              <input
                ref={fileInputRef}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
                id="file-upload"
                type="file"
                onChange={handleFileChange}
                capture="environment"
              />
              
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<CameraAlt />}
                  onClick={() => startCamera()}
                >
                  Take Photo
                </Button>
                <label htmlFor="file-upload" style={{ flex: 1 }}>
                  <Button
                    variant="outlined"
                    component="span"
                    fullWidth
                    startIcon={<InsertPhoto />}
                  >
                    Choose File
                  </Button>
                </label>
              </Box>

              {file && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </Typography>
                  {file.type.startsWith('image/') && (
                    <Box
                      component="img"
                      src={URL.createObjectURL(file)}
                      alt="Preview"
                      sx={{
                        width: '100%',
                        maxHeight: 300,
                        objectFit: 'contain',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                  )}
                </Box>
              )}

              {uploading && <LinearProgress sx={{ mb: 2 }} />}

              <Button
                variant="contained"
                fullWidth
                onClick={handleUpload}
                disabled={!file || uploading}
                sx={{ mt: 2 }}
              >
                {uploading ? 'Uploading...' : 'Upload Invoice'}
              </Button>
            </Box>

            {/* Camera Dialog */}
            <Dialog open={cameraOpen} onClose={stopCamera} maxWidth="sm" fullWidth>
              <DialogTitle>Take Photo</DialogTitle>
              <DialogContent>
                <Box sx={{ 
                  position: 'relative', 
                  width: '100%', 
                  bgcolor: 'black',
                  minHeight: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {!stream && (
                    <Typography color="white">Loading camera...</Typography>
                  )}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => {
                      console.log('Video metadata loaded');
                      if (videoRef.current) {
                        videoRef.current.play().catch(console.error);
                      }
                    }}
                    onCanPlay={() => {
                      console.log('Video can play');
                    }}
                    onError={(e) => {
                      console.error('Video error:', e);
                      setError('Error loading camera feed');
                    }}
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      height: 'auto',
                      display: stream ? 'block' : 'none',
                      backgroundColor: 'transparent',
                    }}
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </Box>
              </DialogContent>
              <DialogActions>
                <Button onClick={stopCamera}>Cancel</Button>
                {isMobile() && (
                  <Button
                    onClick={flipCamera}
                    startIcon={<FlipCameraIos />}
                    disabled={!stream}
                  >
                    Flip
                  </Button>
                )}
                <Button 
                  onClick={capturePhoto} 
                  variant="contained"
                  disabled={!stream}
                >
                  Capture
                </Button>
              </DialogActions>
            </Dialog>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
