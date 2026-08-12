import axios from 'axios';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_BASE_URL = 'https://open.tiktokapis.com/v2';

const clientKey = process.env.TIKTOK_CLIENT_KEY;
const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
const redirectUri = process.env.TIKTOK_REDIRECT_URI;

export function buildTikTokAuthUrl(state, codeChallenge) {
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: 'user.info.basic,video.publish,video.upload',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${TIKTOK_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }).toString();

  const response = await axios.post(TIKTOK_TOKEN_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data;
}

export async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();

  const response = await axios.post(TIKTOK_TOKEN_URL, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data;
}

export async function queryCreatorInfo(accessToken) {
  return axios.post(
    `${TIKTOK_BASE_URL}/post/publish/creator_info/query/`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

export async function initVideoPublish(accessToken, payload) {
  return axios.post(
    `${TIKTOK_BASE_URL}/post/publish/video/init/`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

export async function fetchPublishStatus(accessToken, publishId) {
  return axios.post(
    `${TIKTOK_BASE_URL}/post/publish/status/fetch/`,
    { publish_id: publishId },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}
