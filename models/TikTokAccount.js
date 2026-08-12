import mongoose from 'mongoose';

const TikTokAccountSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  openId: { type: String, unique: true, sparse: true },
  accessToken: { type: String },
  refreshToken: { type: String },
  expiresAt: { type: Date },
  scope: [String],
  authState: { type: String },
  authStateExpiresAt: { type: Date },
  codeVerifier: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('TikTokAccount', TikTokAccountSchema);
