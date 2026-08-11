import express from 'express';
import { getThreadsAuthUrl, threadsCallback, verifyThreads, publishThreads } from '../controllers/threadsController.js';

const router = express.Router();

router.get('/threads/auth', getThreadsAuthUrl);
router.get('/threads/callback', threadsCallback);
router.get('/threads/verify/:userId', verifyThreads);
router.post('/threads/post', publishThreads);

export default router;
