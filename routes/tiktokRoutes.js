import express from 'express';
import {
  initiateAuth,
  handleCallback,
  verifyTikTok,
  getCreatorInfo,
  publishVideo,
  getPostStatus,
} from '../controllers/tiktokController.js';

const router = express.Router();

router.get('/tiktok/auth', initiateAuth);
router.get('/tiktok/callback', handleCallback);
router.get('/tiktok/connected/:userId', verifyTikTok);
router.get('/tiktok/creator-info', getCreatorInfo);
router.post('/tiktok/publish', publishVideo);
router.post('/tiktok/status', getPostStatus);

export default router;
