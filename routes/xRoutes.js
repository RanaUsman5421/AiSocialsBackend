import express from 'express'
import { publishX, startXOAuth, verifyX, xCallback } from '../controllers/xController.js'

const router = express.Router()

router.get('/x/connect', startXOAuth)
router.get('/x/callback', xCallback)
router.get('/x/verify/:userId', verifyX)
router.post('/x/publish', publishX)

export default router