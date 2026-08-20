/**
 * Validate an OAuth token response without exposing response contents.
 * @param json - Decoded provider response.
 * @returns A durable credential's token and finite expiry.
 */
export function validateTokenResponse(json) {
  const expiresIn = json?.expires_in
  if (typeof json?.access_token !== 'string' || json.access_token.length === 0 ||
      typeof json.refresh_token !== 'string' || json.refresh_token.length === 0 ||
      typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('OAuth token response missing required fields')
  }
  const expires = Date.now() + expiresIn * 1000
  if (!Number.isFinite(expires) || expires <= 0) {
    throw new Error('OAuth token response missing required fields')
  }
  return { access: json.access_token, refresh: json.refresh_token, expires }
}
