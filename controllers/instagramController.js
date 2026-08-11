import axios from 'axios'
import User from '../models/User.js'

const FACEBOOK_GRAPH = 'https://graph.facebook.com'
const GRAPH_VERSION = 'v26.0'
const FACEBOOK_OAUTH = `${FACEBOOK_GRAPH}/${GRAPH_VERSION}/oauth/access_token`
const GRAPH_BASE = `${FACEBOOK_GRAPH}/${GRAPH_VERSION}`

export async function instagramCallback(req, res) {
  const { code, userId, redirect_uri } = req.body
  if (!code || !userId) {
    return res.status(400).json({ error: 'Missing code or userId' })
  }

  const redirectUri = redirect_uri || process.env.VITE_IG_CLIENT_REDIRECT_URI || process.env.INSTAGRAM_REDIRECT_URI
  if (!redirectUri) {
    return res.status(500).json({ error: 'Missing redirect URI' })
  }

  try {
    const shortRes = await axios.get(FACEBOOK_OAUTH, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      },
    })

    const shortLivedToken = shortRes.data.access_token
    if (!shortLivedToken) {
      throw new Error('Instagram/Facebook authorization response did not include an access token.')
    }

    const longRes = await axios.get(FACEBOOK_OAUTH, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    })

    const longLivedToken = longRes.data.access_token
    const expiresIn = longRes.data.expires_in
    if (!longLivedToken) {
      throw new Error('Failed to obtain a long-lived access token.')
    }

    const pagesRes = await axios.get(`${GRAPH_BASE}/me/accounts`, {
      params: {
        access_token: longLivedToken,
        fields: 'name,access_token,instagram_business_account{id,username}',
      },
    })

    const pages = pagesRes.data?.data || []
    if (!pages.length) {
      return res.status(400).json({
        error: 'No Facebook Pages were found for this account. Ensure you granted pages_show_list and pages_manage_posts permissions and that your account manages a Facebook Page.',
      })
    }

    const selectedPage = pages.find((page) => page.instagram_business_account?.id && page.access_token)
    if (!selectedPage) {
      const pageWithInstagram = pages.find((page) => page.instagram_business_account?.id)
      if (pageWithInstagram) {
        return res.status(400).json({
          error: 'An Instagram Business Account exists, but the Facebook Page access token was not returned. Grant pages_show_list and pages_manage_posts permissions and try again.',
        })
      }
      return res.status(400).json({
        error: 'No Instagram Business Account was found on your managed Facebook Pages. Convert the Instagram account to a Business or Creator profile and connect it to a Facebook Page.',
      })
    }

    const pageAccessToken = selectedPage.access_token
    const instagramBusiness = selectedPage.instagram_business_account
    if (!instagramBusiness?.id) {
      return res.status(400).json({
        error: 'Instagram Business Account data is missing from the connected Facebook Page.',
      })
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        instagram: {
          userId: instagramBusiness.id,
          username: instagramBusiness.username,
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          pageAccessToken,
          accessToken: pageAccessToken,
          expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        },
      },
      { returnDocument: 'after' }
    )

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ success: true, instagram: updatedUser.instagram, user: updatedUser })
  } catch (err) {
    console.error('instagramCallback error:', err.response?.data || err.message || err)
    const statusCode = err.response?.status || 500
    const message = err.response?.data?.error?.message || err.response?.data?.error || err.response?.data || err.message || 'Instagram authorization failed.'
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({ error: message })
  }
}

export async function publishInstagram(req, res) {
  const { userId, imageUrl, caption } = req.body
  if (!userId || !imageUrl) {
    return res.status(400).json({ error: 'Missing userId or imageUrl' })
  }

  try {
    const user = await User.findById(userId)
    if (!user || !user.instagram || (!user.instagram.accessToken && !user.instagram.pageAccessToken) || !user.instagram.userId) {
      return res.status(400).json({ error: 'Instagram account not connected' })
    }

    const igUserId = user.instagram.userId
    const token = user.instagram.accessToken || user.instagram.pageAccessToken

    const containerRes = await axios.post(
      `${GRAPH_BASE}/${igUserId}/media`,
      null,
      {
        params: {
          image_url: imageUrl,
          caption: caption || '',
          access_token: token,
        },
      }
    )

    const creationId = containerRes.data.id
    if (!creationId) {
      throw new Error('Instagram media container creation failed.')
    }

    const publishRes = await axios.post(
      `${GRAPH_BASE}/${igUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: token,
        },
      }
    )

    res.json({
      success: true,
      mediaId: publishRes.data.id,
      creationId,
      instagramUserId: igUserId,
    })
  } catch (err) {
    console.error('publishInstagram error:', err.response?.data || err.message || err)
    const errorData = err.response?.data || {}
    const error = errorData.error || {}
    const message = error.message || err.message || 'Instagram publish failed'
    if (error.code === 25 || error.error_subcode === 2207050) {
      return res.status(400).json({
        error: 'Instagram account is restricted. The connected account cannot publish through the Graph API.',
        details: message,
      })
    }
    res.status(500).json({ error: message })
  }
}

export async function verifyInstagramToken(req, res) {
  const { userId } = req.params
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' })
  }

  try {
    const user = await User.findById(userId)
    if (!user || !user.instagram || (!user.instagram.accessToken && !user.instagram.pageAccessToken) || !user.instagram.userId) {
      return res.status(400).json({ error: 'Instagram account not connected' })
    }

    const token = user.instagram.accessToken || user.instagram.pageAccessToken
    const check = await axios.get(`${GRAPH_BASE}/${user.instagram.userId}`, {
      params: {
        fields: 'id,username',
        access_token: token,
      },
    })

    const valid = check.data?.id === user.instagram.userId
    return res.json({ valid, instagramProfile: check.data })
  } catch (err) {
    console.error('verifyInstagramToken error:', err.response?.data || err.message || err)
    const message = err.response?.data?.error?.message || err.response?.data || err.message
    res.status(500).json({ error: message || 'Instagram verification failed' })
  }
}
