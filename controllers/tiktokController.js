import crypto from 'crypto';
import TikTokAccount from '../models/TikTokAccount.js';
import {
  buildTikTokAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  queryCreatorInfo,
  initVideoPublish,
  fetchPublishStatus,
} from '../utils/tiktokService.js';

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

async function ensureAccessToken(account) {
  if (!account.accessToken || !account.expiresAt) {
    throw new Error('TikTok access token is not available');
  }

  if (account.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return account.accessToken;
  }

  if (!account.refreshToken) {
    throw new Error('TikTok refresh token is not available');
  }

  const refreshed = await refreshAccessToken(account.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  account.accessToken = refreshed.access_token;
  account.refreshToken = refreshed.refresh_token || account.refreshToken;
  account.expiresAt = expiresAt;
  account.scope = refreshed.scope ? refreshed.scope.split(',') : account.scope;
  await account.save();

  return account.accessToken;
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

  await TikTokAccount.findOneAndUpdate(
    { userId },
    {
      userId,
      authState: state,
      authStateExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      codeVerifier,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
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

  const account = await TikTokAccount.findOne({
    authState: state,
    authStateExpiresAt: { $gt: new Date() },
  });

  if (!account || !account.codeVerifier) {
    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?tiktok=error`);
  }

  try {
    const tokenData = await exchangeCodeForTokens(code, account.codeVerifier);
    const { access_token, refresh_token, expires_in, open_id, scope } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    account.openId = open_id;
    account.accessToken = access_token;
    account.refreshToken = refresh_token;
    account.expiresAt = expiresAt;
    account.scope = scope ? scope.split(',') : [];
    account.authState = undefined;
    account.authStateExpiresAt = undefined;
    await account.save();

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

  const account = await TikTokAccount.findOne({ userId });
  if (!account || !account.accessToken) {
    return res.status(404).json({ connected: false });
  }

  return res.json({ connected: true, openId: account.openId, expiresAt: account.expiresAt });
}

export async function getCreatorInfo(req, res) {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const account = await TikTokAccount.findOne({ userId });
  if (!account) {
    return res.status(404).json({ error: 'TikTok account not connected' });
  }

  try {
    const accessToken = await ensureAccessToken(account);
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

  const account = await TikTokAccount.findOne({ userId });
  if (!account) {
    return res.status(404).json({ error: 'TikTok account not connected' });
  }

  try {
    const accessToken = await ensureAccessToken(account);
    const postPayload = {
      post_info: {
        title: caption || '',
        privacy_level: privacyLevel || 'SELF_ONLY',
        disable_comment: disableComment || false,
        disable_duet: disableDuet || false,
        disable_stitch: disableStitch || false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl,
      },
    };

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

  const account = await TikTokAccount.findOne({ userId });
  if (!account) {
    return res.status(404).json({ error: 'TikTok account not connected' });
  }

  try {
    const accessToken = await ensureAccessToken(account);
    const response = await fetchPublishStatus(accessToken, publishId);
    return res.json(response.data);
  } catch (error) {
    console.error('Post Status Error:', error.response?.data || error.message || error);
    return res.status(500).json({ error: error.response?.data || 'Failed to fetch status' });
  }
}
