import axios from 'axios';

const THREADS_OAUTH = 'https://threads.net/oauth/authorize';
const THREADS_TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const THREADS_TOKEN_EXCHANGE_URL = 'https://graph.threads.net/access_token';
const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0';

export function buildThreadsAuthUrl(userId) {
  const scopes = [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_insights',
    'threads_manage_replies',
  ].join(',');

  const redirectUri = process.env.THREADS_REDIRECT_URI;
  const encodedRedirect = encodeURIComponent(redirectUri);
  const encodedState = encodeURIComponent(userId);

  return `${THREADS_OAUTH}?client_id=${process.env.THREADS_APP_ID}&redirect_uri=${encodedRedirect}&scope=${encodeURIComponent(
    scopes
  )}&response_type=code&state=${encodedState}`;
}

export async function exchangeThreadsCode(code, redirectUri) {
  const params = new URLSearchParams();
  params.append('client_id', process.env.THREADS_APP_ID);
  params.append('client_secret', process.env.THREADS_APP_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', redirectUri);
  params.append('code', code);

  const response = await axios.post(THREADS_TOKEN_URL, params);
  return response.data;
}

export async function exchangeShortTokenForLongToken(shortLivedToken) {
  const response = await axios.get(THREADS_TOKEN_EXCHANGE_URL, {
    params: {
      grant_type: 'th_exchange_token',
      client_secret: process.env.THREADS_APP_SECRET,
      access_token: shortLivedToken,
    },
  });

  return response.data;
}

export async function verifyThreadsToken(threadsUserId, accessToken) {
  const response = await axios.get(`${THREADS_GRAPH_BASE}/${threadsUserId}`, {
    params: {
      access_token: accessToken,
      fields: 'id',
    },
  });

  return response.data;
}

export async function createThreadsContainer(threadsUserId, accessToken, mediaType, text, imageUrl) {
  const params = new URLSearchParams();
  params.append('media_type', mediaType);
  params.append('access_token', accessToken);

  if (text) params.append('text', text);
  if (mediaType === 'IMAGE' && imageUrl) params.append('image_url', imageUrl);

  const response = await axios.post(`${THREADS_GRAPH_BASE}/${threadsUserId}/threads`, params);
  return response.data;
}

export async function publishThreadsContainer(threadsUserId, accessToken, creationId) {
  const params = new URLSearchParams();
  params.append('creation_id', creationId);
  params.append('access_token', accessToken);

  const response = await axios.post(`${THREADS_GRAPH_BASE}/${threadsUserId}/threads_publish`, params);
  return response.data;
}
