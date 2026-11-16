/**
 * Cognito email + password auth client directly from browser (no heavy SDK).
 * When VITE_COGNITO_CLIENT_ID is empty (local dev), operates in zero-friction local mode.
 */

export interface AuthConfig {
  region: string
  clientId: string
  domain: string
  googleEnabled: boolean
}

export function authConfig(): AuthConfig {
  const env = import.meta.env
  return {
    region: env.VITE_COGNITO_REGION || "us-east-1",
    clientId: env.VITE_COGNITO_CLIENT_ID ?? "",
    domain: env.VITE_COGNITO_DOMAIN ?? "",
    googleEnabled: env.VITE_COGNITO_GOOGLE === "true" && Boolean(env.VITE_COGNITO_DOMAIN),
  }
}

export const authEnabled = () => Boolean(authConfig().clientId)
export const googleEnabled = () => authEnabled() && authConfig().googleEnabled

export class AuthError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "AuthError"
    this.code = code
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  NotAuthorizedException: "Incorrect email or password",
  UserNotFoundException: "Incorrect email or password",
  UserNotConfirmedException: "Please confirm your email with the 6-digit verification code first",
  UsernameExistsException: "An account with this email already exists",
  CodeMismatchException: "Invalid confirmation code — check your inbox",
  ExpiredCodeException: "Confirmation code expired — request a new one",
  InvalidPasswordException: "Password must be at least 8 characters with letters and numbers",
  InvalidParameterException: "Please check your email and password format",
  LimitExceededException: "Too many attempts — wait a few minutes",
  TooManyRequestsException: "Too many requests — please wait a moment and try again",
}

async function cognito<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const { region, clientId } = authConfig()
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify({ ClientId: clientId, ...body }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code =
      String(data.__type ?? "")
        .split("#")
        .pop() || "UnknownError"
    throw new AuthError(code, FRIENDLY_MESSAGES[code] ?? data.message ?? "Authentication failed")
  }
  return data as T
}

interface Session {
  idToken: string
  refreshToken?: string
  expiresAt: number
}

const SESSION_KEY = "sharp.session"
const LOCAL_SESSION: Session = { idToken: "", expiresAt: Number.MAX_SAFE_INTEGER }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore private browsing quota errors
  }
}

interface Tokens {
  IdToken: string
  RefreshToken?: string
  ExpiresIn: number
}

function saveTokens(tokens: Tokens, previousRefresh?: string) {
  writeSession({
    idToken: tokens.IdToken,
    refreshToken: tokens.RefreshToken ?? previousRefresh,
    expiresAt: Date.now() + tokens.ExpiresIn * 1000,
  })
}

export function isSignedIn(): boolean {
  const session = readSession()
  if (!session) return false
  if (!authEnabled()) return true
  return Boolean(session.idToken || session.refreshToken)
}

export function signOut() {
  writeSession(null)
}

export async function getIdToken(): Promise<string | null> {
  const session = readSession()
  if (!session || !authEnabled()) return null
  if (session.expiresAt - 60_000 > Date.now()) return session.idToken
  if (!session.refreshToken) {
    signOut()
    return null
  }
  try {
    const { AuthenticationResult } = await cognito<{ AuthenticationResult: Tokens }>(
      "InitiateAuth",
      {
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: session.refreshToken },
      },
    )
    saveTokens(AuthenticationResult, session.refreshToken)
    return AuthenticationResult.IdToken
  } catch {
    signOut()
    return null
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!authEnabled()) {
    writeSession(LOCAL_SESSION)
    return
  }
  const result = await cognito<{ AuthenticationResult?: Tokens; ChallengeName?: string }>(
    "InitiateAuth",
    {
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: email, PASSWORD: password },
    },
  )
  if (!result.AuthenticationResult) {
    throw new AuthError(
      result.ChallengeName ?? "ChallengeRequired",
      "Account requires an unsupported auth challenge",
    )
  }
  saveTokens(result.AuthenticationResult)
}

export async function signUp(email: string, password: string, name: string): Promise<boolean> {
  if (!authEnabled()) {
    writeSession(LOCAL_SESSION)
    return true
  }
  const res = await cognito<{ UserConfirmed: boolean }>("SignUp", {
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: "email", Value: email },
      ...(name.trim() ? [{ Name: "name", Value: name.trim() }] : []),
    ],
  })
  return res.UserConfirmed
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  if (!authEnabled()) {
    writeSession(LOCAL_SESSION)
    return
  }
  await cognito("ConfirmSignUp", { Username: email, ConfirmationCode: code })
}

export async function resendConfirmationCode(email: string): Promise<void> {
  if (!authEnabled()) return
  await cognito("ResendConfirmationCode", { Username: email })
}

const PKCE_KEY = "sharp.pkce"
export const oauthCallbackUrl = () => `${window.location.origin}/auth/callback`

let pendingSignUpCreds: { email: string; password: string } | null = null

export function setPendingSignUpPassword(email: string, password: string) {
  pendingSignUpCreds = { email: email.trim().toLowerCase(), password }
}

export function consumePendingSignUpPassword(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  const match = pendingSignUpCreds && pendingSignUpCreds.email === normalized
    ? pendingSignUpCreds.password
    : null
  pendingSignUpCreds = null
  return match
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function startGoogleSignIn(): Promise<void> {
  const { clientId, domain } = authConfig()
  if (!clientId || !domain) {
    throw new AuthError("GoogleDisabled", "Google sign-in is not configured")
  }
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)))
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)))
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  )
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, nonce }))
  const params = new URLSearchParams({
    identity_provider: "Google",
    response_type: "code",
    client_id: clientId,
    redirect_uri: oauthCallbackUrl(),
    scope: "openid email profile",
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: challenge,
  })
  window.location.assign(`https://${domain}/oauth2/authorize?${params}`)
}

export async function completeOAuthSignIn(code: string, state: string): Promise<void> {
  const { clientId, domain } = authConfig()
  const savedRaw = sessionStorage.getItem(PKCE_KEY)
  sessionStorage.removeItem(PKCE_KEY)
  const saved = savedRaw
    ? (JSON.parse(savedRaw) as { verifier: string; state: string; nonce?: string })
    : null
  if (!saved || saved.state !== state) {
    throw new AuthError("StateMismatch", "Sign-in expired or was started elsewhere, try again")
  }
  const response = await fetch(`https://${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: oauthCallbackUrl(),
      code_verifier: saved.verifier,
    }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.id_token) {
    throw new AuthError(
      String(data.error ?? "TokenError"),
      "Google sign-in failed, please try again",
    )
  }
  const claims = decodeJwtPayload(String(data.id_token))
  if (saved.nonce && claims?.nonce !== saved.nonce) {
    throw new AuthError("NonceMismatch", "Sign-in verification failed, please try again")
  }
  saveTokens({
    IdToken: data.id_token,
    RefreshToken: data.refresh_token,
    ExpiresIn: Number(data.expires_in) || 3600,
  })
}
