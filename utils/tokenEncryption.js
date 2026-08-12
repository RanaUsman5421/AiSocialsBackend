import crypto from 'node:crypto'

const algorithm = 'aes-256-gcm'

function getKey() {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'hex')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string')
  }
  return key
}

export function encryptToken(value) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(algorithm, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
}

export function decryptToken(payload) {
  const [ivValue, tagValue, encryptedValue] = payload.split('.')
  const decipher = crypto.createDecipheriv(algorithm, getKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}