import crypto from 'crypto';
import User from '../models/User.js';
import {
  buildTikTokAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  queryCreatorInfo,
  initVideoPublish,
  fetchPublishStatus,
} from '../utils/tiktokService.js';

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

async function ensureAccessToken(user) {
  if (!user.tiktok?.accessToken || !user.tiktok?.expiresAt) {
    throw new Error('TikTok access token is not available');
  }

  if (user.tiktok.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return user.tiktok.accessToken;
  }

  if (!user.tiktok.refreshToken) {
    throw new Error('TikTok refresh token is not available');
  }

  const refreshed = await refreshAccessToken(user.tiktok.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  user.tiktok.accessToken = refreshed.access_token;
  user.tiktok.refreshToken = refreshed.refresh_token || user.tiktok.refreshToken;
  user.tiktok.expiresAt = expiresAt;
  user.tiktok.scope = refreshed.scope ? refreshed.scope.split(',') : user.tiktok.scope;
  await user.save();

  return user.tiktok.accessToken;
}

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function initiateAuth(req, res) {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());

  await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        'tiktok.authState': state,
        'tiktok.authStateExpiresAt': new Date(Date.now() + 10 * 60 * 1000),
        'tiktok.codeVerifier': codeVerifier,
      },
    },
    { new: true }
  );

  const authUrl = buildTikTokAuthUrl(state, codeChallenge);
  return res.redirect(authUrl);
}

export async function handleCallback(req, res) {
  const { code, state, error } = req.query;
  if (error) {
    console.error('TikTok callback error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?tiktok=error`);
  }

  if (!code || !state) {
    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?tiktok=error`);
  }

  const user = await User.findOne({
    'tiktok.authState': state,
    'tiktok.authStateExpiresAt': { $gt: new Date() },
  });

  if (!user || !user.tiktok?.codeVerifier) {
    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?tiktok=error`);
  }

  try {
    const tokenData = await exchangeCodeForTokens(code, user.tiktok.codeVerifier);
    const { access_token, refresh_token, expires_in, open_id, scope } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    user.tiktok.openId = open_id;
    user.tiktok.accessToken = access_token;
    user.tiktok.refreshToken = refresh_token;
    user.tiktok.expiresAt = expiresAt;
    user.tiktok.scope = scope ? scope.split(',') : [];
    user.tiktok.authState = null;
    user.tiktok.authStateExpiresAt = null;
    await user.save();

    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?tiktok=connected`);
  } catch (err) {
    console.error('TikTok Auth Error:', err.response?.data || err.message || err);
    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?tiktok=error`);
  }
}

export async function verifyTikTok(req, res) {
  const { userId } = req.params;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const user = await User.findById(userId);
  if (!user || !user.tiktok?.accessToken) {
    return res.status(404).json({ connected: false });
  }

  return res.json({ connected: true, openId: user.tiktok.openId, expiresAt: user.tiktok.expiresAt });
}

export async function getCreatorInfo(req, res) {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const user = await User.findById(userId);
  if (!user || !user.tiktok) {
    return res.status(404).json({ error: 'TikTok account not connected' });
  }

  try {
    const accessToken = await ensureAccessToken(user);
    const response = await queryCreatorInfo(accessToken);
    return res.json(response.data);
  } catch (error) {
    console.error('Creator Info Error:', error.response?.data || error.message || error);
    return res.status(500).json({ error: error.response?.data || 'Failed to fetch creator info' });
  }
}

export async function publishVideo(req, res) {
  const { userId, videoUrl, caption, privacyLevel, disableComment, disableDuet, disableStitch } = req.body;
  if (!userId || !videoUrl) {
    return res.status(400).json({ error: 'Missing userId or videoUrl' });
  }

  const user = await User.findById(userId);
  if (!user || !user.tiktok) {
    return res.status(404).json({ error: 'TikTok account not connected' });
  }

  try {
    const accessToken = await ensureAccessToken(user);

    // Step 1: Query creator info to get allowed privacy options
    let allowedPrivacyOptions = ['SELF_ONLY'];
    try {
      const creatorInfo = await queryCreatorInfo(accessToken);
      if (creatorInfo.data?.data?.privacy_level_options) {
        allowedPrivacyOptions = creatorInfo.data.data.privacy_level_options;
        console.log('Allowed privacy options:', allowedPrivacyOptions);
      }
    } catch (creatorError) {
      console.warn('Could not fetch creator info, using default privacy options:', creatorError.message);
    }

    // Step 2: Validate and set privacy level
    const selectedPrivacy = privacyLevel || 'SELF_ONLY';
    if (!allowedPrivacyOptions.includes(selectedPrivacy)) {
      return res.status(400).json({
        error: `Privacy level '${selectedPrivacy}' not allowed for this account`,
        allowedOptions: allowedPrivacyOptions,
      });
    }

    // Step 3: Build and send post payload with exact enum values
    const postPayload = {
      post_info: {
        title: caption || '',
        privacy_level: selectedPrivacy, // Exact string matching TikTok enum
        disable_comment: disableComment || false,
        disable_duet: disableDuet || false,
        disable_stitch: disableStitch || false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    };

    console.log('Publishing with payload:', JSON.stringify(postPayload, null, 2));

    const response = await initVideoPublish(accessToken, postPayload);
    return res.json({ success: true, publishId: response.data?.data?.publish_id });
  } catch (error) {
    console.error('Publish Error:', error.response?.data || error.message || error);
    return res.status(500).json({ error: error.response?.data || 'Video publishing failed' });
  }
}

export async function getPostStatus(req, res) {
  const { userId, publishId } = req.body;
  if (!userId || !publishId) {
    return res.status(400).json({ error: 'Missing userId or publishId' });
  }

  const user = await User.findById(userId);
  if (!user || !user.tiktok) {
    return res.status(404).json({ error: 'TikTok account not connected' });
  }

  try {
    const accessToken = await ensureAccessToken(user);
    const response = await fetchPublishStatus(accessToken, publishId);
    return res.json(response.data);
  } catch (error) {
    console.error('Post Status Error:', error.response?.data || error.message || error);
    return res.status(500).json({ error: error.response?.data || 'Failed to fetch status' });
  }
}

export async function disconnectTikTok(req, res) {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clear all TikTok credentials
    user.tiktok = {
      userId: undefined,
      openId: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      scope: [],
      authState: undefined,
      authStateExpiresAt: undefined,
      codeVerifier: undefined,
    };

    await user.save();
    return res.json({ success: true, message: 'TikTok account disconnected successfully' });
  } catch (error) {
    console.error('Disconnect Error:', error.message);
    return res.status(500).json({ error: 'Failed to disconnect TikTok account' });
  }
}
