import User from '../models/User.js'
import { decryptToken, encryptToken } from '../utils/tokenEncryption.js'
import {
  buildAuthorizationUrl,
  createPkcePair,
  createState,
  exchangeCode,
  getCurrentUser,
  publishTweet,
} from '../utils/xService.js'

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173'

export async function startXOAuth(req, res) {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'Missing userId' })
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET || !process.env.X_CALLBACK_URL) {
    return res.status(500).json({ error: 'X OAuth is not configured on the server' })
  }

  const { verifier, challenge } = createPkcePair()
  const state = createState()
  await User.findByIdAndUpdate(userId, {
    $set: {
      'x.oauthState': state,
      'x.codeVerifier': verifier,
      'x.oauthStateExpiresAt': new Date(Date.now() + 10 * 60 * 1000),
    },
  })
  return res.redirect(buildAuthorizationUrl(state, challenge))
}

export async function xCallback(req, res) {
  const { code, state, error } = req.query
  if (error) return res.redirect(`${frontendUrl()}/auth/x/callback?error=x_authorization_denied`)
  if (!code || !state) return res.redirect(`${frontendUrl()}/auth/x/callback?error=missing_callback_data`)

  try {
    const user = await User.findOneAndUpdate({
      'x.oauthState': state,
      'x.oauthStateExpiresAt': { $gt: new Date() },
    }, {
      $unset: {
        'x.oauthState': 1,
        'x.codeVerifier': 1,
        'x.oauthStateExpiresAt': 1,
      },
    })
    if (!user?.x?.codeVerifier) {
      return res.redirect(`${frontendUrl()}/auth/x/callback?error=invalid_or_expired_state`)
    }

    const tokenData = await exchangeCode(code, user.x.codeVerifier)
    const profile = await getCurrentUser(tokenData.access_token)
    await User.findByIdAndUpdate(user._id, {
      $set: {
        x: {
          userId: profile.id,
          username: profile.username,
          name: profile.name,
          accessTokenEncrypted: encryptToken(tokenData.access_token),
          refreshTokenEncrypted: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : undefined,
          expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        },
      },
    })
    return res.redirect(`${frontendUrl()}/auth/x/callback?connected=true`)
  } catch (err) {
    console.error('xCallback error:', err.response?.data || err.message)
    return res.redirect(`${frontendUrl()}/auth/x/callback?error=x_connection_failed`)
  }
}

export async function verifyX(req, res) {
  const user = await User.findById(req.params.userId)
  if (!user?.x?.accessTokenEncrypted) return res.status(400).json({ error: 'X account not connected' })
  try {
    const profile = await getCurrentUser(decryptToken(user.x.accessTokenEncrypted))
    return res.json({ valid: profile.id === user.x.userId, profile: { id: profile.id, username: profile.username, name: profile.name } })
  } catch (err) {
    console.error('verifyX error:', err.response?.data || err.message)
    return res.status(401).json({ valid: false, error: 'X token is invalid or expired' })
  }
}

export async function publishX(req, res) {
  const { userId, text } = req.body
  if (!userId || !text?.trim()) return res.status(400).json({ error: 'Missing userId or text' })
  const user = await User.findById(userId)
  if (!user?.x?.accessTokenEncrypted) return res.status(400).json({ error: 'X account not connected' })
  try {
    const post = await publishTweet(decryptToken(user.x.accessTokenEncrypted), text.trim())
    return res.json({ success: true, postId: post.id })
  } catch (err) {
    console.error('publishX error:', err.response?.data || err.message)
    return res.status(err.response?.status === 401 ? 401 : 500).json({ error: err.response?.data?.detail || 'X publish failed' })
  }
}