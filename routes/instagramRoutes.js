import express from 'express'
import { instagramCallback, publishInstagram, verifyInstagramToken } from '../controllers/instagramController.js'

const router = express.Router()

router.post('/auth/instagram/callback', instagramCallback)
router.post('/instagram/publish', publishInstagram)
router.get('/instagram/verify/:userId', verifyInstagramToken)

export default router
