/**
 * Custom error thrown when the OAuth token is expired or revoked.
 * Includes a reAuthUrl that the UI can use to redirect the user.
 *
 * This file is intentionally kept free of Node.js-only dependencies (fs, path)
 * so it can be safely imported in both server and client contexts.
 */
export class TokenExpiredError extends Error {
  public readonly reAuthUrl: string

  constructor(message: string, returnTo: string = '/') {
    super(message)
    this.name = 'TokenExpiredError'
    this.reAuthUrl = `/api/auth/google-ads?returnTo=${encodeURIComponent(returnTo)}`
  }
}
