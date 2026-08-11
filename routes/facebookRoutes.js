import express from 'express';
import { facebookCallback, publishPhoto, publishPost, verifyPageToken } from '../controllers/facebookController.js';

const router = express.Router();

// Exchange code -> page token and save to user
router.post('/auth/facebook/callback', facebookCallback);

// Publish a photo to stored page
router.post('/facebook/publish-photo', publishPhoto);

// Publish a text post to stored page
router.post('/facebook/publish-post', publishPost);

// Verify stored page token
router.get('/facebook/verify/:userId', verifyPageToken);

export default router;
