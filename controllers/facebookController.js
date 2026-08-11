import axios from 'axios';
import User from '../models/User.js';

const FACEBOOK_GRAPH = 'https://graph.facebook.com';

export async function facebookCallback(req, res) {
  const { code, userId, redirect_uri } = req.body;
  if (!code || !userId) return res.status(400).json({ error: 'Missing code or userId' });

  try {
    // Exchange code for short-lived user token
    const shortRes = await axios.get(`${FACEBOOK_GRAPH}/v26.0/oauth/access_token`, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirect_uri || process.env.FRONTEND_REDIRECT_URI,
        code,
      },
    });

    const shortUserToken = shortRes.data.access_token;

    // Exchange to long-lived token
    const longRes = await axios.get(`${FACEBOOK_GRAPH}/v26.0/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortUserToken,
      },
    });

    const longUserToken = longRes.data.access_token;

    // Fetch pages
    const pagesRes = await axios.get(`${FACEBOOK_GRAPH}/v26.0/me/accounts`, {
      params: { access_token: longUserToken },
    });

    const pages = pagesRes.data.data;
    if (!pages || pages.length === 0) return res.status(400).json({ error: 'No managed Facebook pages found.' });

    const selectedPage = pages[0];

    // Store page info on user record
    const updated = await User.findByIdAndUpdate(
      userId,
      { facebook: { pageId: selectedPage.id, pageName: selectedPage.name, pageAccessToken: selectedPage.access_token } },
      { new: true }
    );

    res.json({
      success: true,
      pageName: selectedPage.name,
      pageId: selectedPage.id,
      pageAccessToken: selectedPage.access_token,
      user: updated,
    });
  } catch (err) {
    console.error('facebookCallback error:', err.response?.data || err.message || err);
    res.status(500).json({ error: err.response?.data || err.message });
  }
}

export async function publishPhoto(req, res) {
  const { userId, imageUrl, caption } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const user = await User.findById(userId);
    if (!user || !user.facebook || !user.facebook.pageAccessToken) return res.status(400).json({ error: 'Facebook Page not connected' });

    const postRes = await axios.post(`${FACEBOOK_GRAPH}/v26.0/${user.facebook.pageId}/photos`, null, {
      params: {
        url: imageUrl,
        caption: caption || '',
        access_token: user.facebook.pageAccessToken,
      },
    });

    res.json({ success: true, photoId: postRes.data.id, postId: postRes.data.post_id });
  } catch (err) {
    console.error('publishPhoto error:', err.response?.data || err.message || err);
    res.status(500).json({ error: err.response?.data?.error?.message || 'Publish failed' });
  }
}

export async function publishPost(req, res) {
  const { userId, message } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const user = await User.findById(userId);
    if (!user || !user.facebook || !user.facebook.pageAccessToken || !user.facebook.pageId) {
      return res.status(400).json({ error: 'Facebook Page not connected' });
    }

    const pageId = user.facebook.pageId;
    const pageToken = user.facebook.pageAccessToken;
    console.log('Publishing post using PageId:', pageId);

    const postRes = await axios.post(`${FACEBOOK_GRAPH}/v26.0/${pageId}/feed`, null, {
      params: {
        message,
        access_token: pageToken,
      },
    });

    res.json({ success: true, postId: postRes.data.id, pageId, message });
  } catch (err) {
    console.error('publishPost error:', err.response?.data || err.message || err);
    res.status(500).json({ error: err.response?.data?.error?.message || 'Publish failed' });
  }
}

export async function verifyPageToken(req, res) {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const user = await User.findById(userId);
    if (!user || !user.facebook || !user.facebook.pageAccessToken) return res.status(400).json({ error: 'Not connected' });

    const check = await axios.get(`${FACEBOOK_GRAPH}/v26.0/${user.facebook.pageId}`, {
      params: { access_token: user.facebook.pageAccessToken, fields: 'id,name' },
    });

    res.json({ valid: true, page: check.data });
  } catch (err) {
    console.error('verifyPageToken error:', err.response?.data || err.message || err);
    res.status(500).json({ error: err.response?.data?.error?.message || 'Verification failed' });
  }
}
