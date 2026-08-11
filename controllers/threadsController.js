import User from '../models/User.js';
import {
  buildThreadsAuthUrl,
  exchangeThreadsCode,
  exchangeShortTokenForLongToken,
  createThreadsContainer,
  publishThreadsContainer,
  verifyThreadsToken,
} from '../utils/threadsService.js';

export function getThreadsAuthUrl(req, res) {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const authUrl = buildThreadsAuthUrl(userId);
  return res.redirect(authUrl);
}

export async function threadsCallback(req, res) {
  const code = req.query.code;
  const state = req.query.state;
  if (!code) return res.status(400).send('Missing authorization code');
  if (!state) return res.status(400).send('Missing state user id');

  const userId = state;
  const redirectUri = process.env.THREADS_REDIRECT_URI;

  try {
    const tokenData = await exchangeThreadsCode(code, redirectUri);
    const shortLivedToken = tokenData.access_token;
    const userThreadId = tokenData.user_id;

    const longTokenData = await exchangeShortTokenForLongToken(shortLivedToken);
    const longLivedToken = longTokenData.access_token;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          threads: {
            userId: userThreadId,
            accessToken: longLivedToken,
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          },
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).send('App user not found');
    }

    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?threads=connected&user_id=${userThreadId}`);
  } catch (error) {
    console.error('threadsCallback error:', error.response?.data || error.message || error);
    return res.redirect(`${process.env.FRONTEND_URL}/socialaccounts?threads=error`);
  }
}

export async function verifyThreads(req, res) {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const user = await User.findById(userId);
  if (!user || !user.threads || !user.threads.accessToken || !user.threads.userId) {
    return res.status(400).json({ error: 'Threads account not connected' });
  }

  try {
    const profile = await verifyThreadsToken(user.threads.userId, user.threads.accessToken);
    const valid = profile?.id === user.threads.userId;
    return res.json({ valid, profile });
  } catch (error) {
    console.error('verifyThreads error:', error.response?.data || error.message || error);
    return res.status(500).json({ error: 'Threads verification failed' });
  }
}

export async function publishThreads(req, res) {
  const { userId, mediaType, text, imageUrl } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  if (!mediaType) return res.status(400).json({ error: 'Missing mediaType' });
  if (mediaType === 'TEXT' && (!text || !text.trim())) {
    return res.status(400).json({ error: 'Text content is required for TEXT posts' });
  }
  if (mediaType === 'IMAGE' && (!imageUrl || !imageUrl.trim())) {
    return res.status(400).json({ error: 'Image URL is required for IMAGE posts' });
  }

  const appUser = await User.findById(userId);
  if (!appUser || !appUser.threads || !appUser.threads.accessToken || !appUser.threads.userId) {
    return res.status(400).json({ error: 'Threads account not connected' });
  }

  try {
    await verifyThreadsToken(appUser.threads.userId, appUser.threads.accessToken);

    const container = await createThreadsContainer(
      appUser.threads.userId,
      appUser.threads.accessToken,
      mediaType,
      text,
      imageUrl
    );

    if (!container?.id) {
      throw new Error('Failed to create Threads container');
    }

    const publish = await publishThreadsContainer(appUser.threads.userId, appUser.threads.accessToken, container.id);
    return res.json({ success: true, postId: publish.id, containerId: container.id, creationId: container.id });
  } catch (error) {
    console.error('publishThreads error:', error.response?.data || error.message || error);
    return res.status(500).json({ error: error.response?.data?.error?.message || 'Threads publish failed' });
  }
}
