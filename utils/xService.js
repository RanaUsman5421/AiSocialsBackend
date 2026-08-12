import crypto from 'node:crypto'
import axios from 'axios'

const AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
const TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const API_BASE = 'https://api.x.com/2'
const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access']

function base64Url(value) {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createPkcePair() {
  const verifier = base64Url(crypto.randomBytes(48))
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function createState() {
  return base64Url(crypto.randomBytes(32))
}

export function buildAuthorizationUrl(state, challenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: process.env.X_CALLBACK_URL,
    scope: scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: process.env.X_CALLBACK_URL,
    code_verifier: verifier,
  })
  const response = await axios.post(TOKEN_URL, body, {
    auth: { username: process.env.X_CLIENT_ID, password: process.env.X_CLIENT_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data
}

export async function getCurrentUser(accessToken) {
  const response = await axios.get(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data.data
}

export async function publishTweet(accessToken, text) {
  const response = await axios.post(`${API_BASE}/tweets`, { text }, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data.data
}