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

/** Validate the OAuth browser callback query and CSRF state. */
export function validateCallback(query, expectedState) {
  if (query?.state !== expectedState) throw new Error('OAuth callback state mismatch')
  if (typeof query?.code !== 'string' || query.code.trim().length === 0) throw new Error('OAuth callback missing authorization code')
  return query.code
}

/** Validate the device authorization response identifiers. */
export function validateDeviceAuthorization(response) {
  if (typeof response?.device_auth_id !== 'string' || response.device_auth_id.trim().length === 0 ||
      typeof response.user_code !== 'string' || response.user_code.trim().length === 0) throw new Error('Invalid device code response: missing required fields')
  return response
}

/** Validate the device token response used for the PKCE exchange. */
export function validateDeviceToken(response) {
  if (typeof response?.authorization_code !== 'string' || response.authorization_code.trim().length === 0 ||
      typeof response.code_verifier !== 'string' || response.code_verifier.trim().length === 0) throw new Error('Invalid device token response: missing required fields')
  return response
}
