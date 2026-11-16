import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Eye, EyeOff, LoaderCircle, Moon, Sun, Zap } from "lucide-react"
import {
  AuthError,
  authEnabled,
  completeOAuthSignIn,
  confirmSignUp,
  consumePendingSignUpPassword,
  googleEnabled,
  resendConfirmationCode,
  setPendingSignUpPassword,
  signIn,
  signUp,
  startGoogleSignIn,
} from "@/lib/auth"
import { COPY, useLanguage } from "@/lib/i18n"
import { useTheme } from "@/lib/theme"

const DUSK_SKY_SRC = "/dusk-sky.webp"
const DUSK_PEAKS_SRC = "/dusk-peaks.webp"
const DUSK_MIST_SRC = "/dusk-mist.webp"

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [lang, setLang] = useLanguage()
  const [theme, setTheme] = useTheme()
  const t = COPY[lang]
  const mainRef = useRef<HTMLElement>(null)
  const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    const updateRect = () => {
      const r = el.getBoundingClientRect()
      rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    updateRect()

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateRect) : null
    observer?.observe(el)

    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null
    reducedMotionRef.current = Boolean(mq?.matches)
    const onMotionChange = (ev: MediaQueryListEvent) => {
      reducedMotionRef.current = ev.matches
      if (ev.matches && mainRef.current) {
        mainRef.current.style.setProperty("--px", "0")
        mainRef.current.style.setProperty("--py", "0")
      }
    }
    mq?.addEventListener("change", onMotionChange)

    return () => {
      observer?.disconnect()
      mq?.removeEventListener("change", onMotionChange)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const applyParallax = (px: number, py: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = mainRef.current
      if (!el) return
      el.style.setProperty("--px", px.toFixed(4))
      el.style.setProperty("--py", py.toFixed(4))
    })
  }

  const handleHeroPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (reducedMotionRef.current || e.pointerType !== "mouse") return
    const el = mainRef.current
    if (!el) return
    if (!rectRef.current || rectRef.current.width <= 0) {
      const r = el.getBoundingClientRect()
      rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    const { left, top, width, height } = rectRef.current
    if (width <= 0 || height <= 0) return
    const nx = Math.max(-1, Math.min(1, ((e.clientX - left) / width - 0.5) * 2))
    const ny = Math.max(-1, Math.min(1, ((e.clientY - top) / height - 0.5) * 2))
    applyParallax(nx, ny)
  }

  const handleHeroPointerLeave = () => {
    applyParallax(0, 0)
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-[var(--container)] items-center justify-between px-4 sm:px-8 lg:px-16">
          <Link to="/login" className="inline-flex items-center gap-2 text-ink" aria-label="Sharp">
            <Zap className="h-4 w-4 text-accent" aria-hidden="true" />
            <span className="font-display text-lg font-medium tracking-tight text-ink">Sharp</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? t.switchToLight : t.switchToDark}
              title={theme === "dark" ? t.switchToLight : t.switchToDark}
              className="dusk-chip inline-flex h-8 w-8 items-center justify-center rounded-pill text-ink-2 hover:text-ink"
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>

            <div
              className="inline-flex items-center gap-1 border-b border-rule pb-0.5"
              role="group"
              aria-label="Language"
            >
              {(["uk", "en"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    lang === code ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {lang === code && (
                    <span className="h-1.5 w-1.5 rounded-pill bg-accent" aria-hidden="true" />
                  )}
                  <span>{code === "uk" ? "Укр" : "Eng"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        onPointerMove={handleHeroPointerMove}
        onPointerLeave={handleHeroPointerLeave}
        className="relative flex flex-1 items-center overflow-hidden"
      >
        <div data-slot="hero" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="dusk-parallax-sky absolute inset-0">
            <img
              src={DUSK_SKY_SRC}
              width={1920}
              height={1280}
              fetchPriority="high"
              alt=""
              aria-hidden="true"
              className="dusk-sky-drift h-full w-full object-cover object-[center_42%]"
            />
          </div>
          <div className="dusk-parallax-peaks absolute inset-0">
            <img
              src={DUSK_PEAKS_SRC}
              width={1920}
              height={1280}
              fetchPriority="high"
              alt={t.authPhotoAlt}
              className="dusk-peaks-drift h-full w-full object-cover object-[center_42%]"
            />
          </div>
          <div className="dusk-parallax-mist absolute inset-0">
            <img
              src={DUSK_MIST_SRC}
              width={1920}
              height={1280}
              alt=""
              aria-hidden="true"
              className="dusk-mist-drift h-full w-full object-cover object-[center_42%]"
            />
          </div>
        </div>
        <div
          className="dusk-hero-fade pointer-events-none absolute inset-x-0 bottom-0 h-36"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto grid w-full max-w-[var(--container)] items-center gap-8 px-4 py-10 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:px-16">
          <section className="dusk-text-scrim dusk-parallax-mid max-w-lg px-5 py-8 text-day-ink sm:px-9 sm:py-11 lg:col-span-5">
            <h1 className="font-display text-3xl font-medium tracking-tight text-day-ink sm:text-[2.25rem]">
              {title}
            </h1>
            <p className="mt-3 font-display text-lg font-medium text-day-ink">{t.authHeroTitle}</p>
          </section>

          <section className="dusk-glass-pane dusk-parallax-pane mx-auto w-full max-w-[380px] p-5 text-ink sm:p-6 lg:col-span-5 lg:col-start-8 lg:mr-0 lg:ml-auto">
            <div className="space-y-4">
              {!authEnabled() && (
                <div className="dusk-glass-row-rule border-b pb-3 text-xs leading-relaxed text-ink-2">
                  {t.authLocalHint}
                </div>
              )}

              {children}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-rule bg-paper py-4">
        <div className="mx-auto flex w-full max-w-[var(--container)] flex-wrap items-center justify-between gap-3 px-4 text-xs text-muted sm:px-8 lg:px-16">
          <span>{t.brandTagline}</span>
          <span>
            {t.photoCreditPrefix}{" "}
            <a
              href="https://commons.wikimedia.org/wiki/File:Drei_Zinnen_Tre_Cime_di_Lavaredo_Dolomites.jpg"
              target="_blank"
              rel="noreferrer"
              className="text-ink-2 underline hover:text-accent"
            >
              Wolfgang Moroder
            </a>{" "}
            (CC BY-SA 3.0, Wikimedia Commons)
          </span>
        </div>
      </footer>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

function GoogleAuthSection({ onError }: { onError: (msg: string) => void }) {
  const [lang] = useLanguage()
  const t = COPY[lang]
  const [busy, setBusy] = useState(false)

  if (!googleEnabled()) return null

  const handleGoogle = async () => {
    setBusy(true)
    try {
      await startGoogleSignIn()
    } catch (err) {
      setBusy(false)
      onError(err instanceof Error ? err.message : t.googleSignInFailed)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={busy}
        onClick={handleGoogle}
        className="dusk-btn-ghost flex w-full items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink"
      >
        <GoogleIcon />
        <span>{t.continueWithGoogle}</span>
      </button>

      <div className="flex items-center gap-3 text-xs font-medium text-ink-2">
        <span className="dusk-divider-rule h-px flex-1" />
        <span>{t.orDivider}</span>
        <span className="dusk-divider-rule h-px flex-1" />
      </div>
    </div>
  )
}

export function LoginPage() {
  const [lang] = useLanguage()
  const t = COPY[lang]
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const justConfirmed = searchParams.get("confirmed") === "1"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNeedsConfirm(false)
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      navigate("/", { replace: true })
    } catch (err) {
      if (err instanceof AuthError && err.code === "UserNotConfirmedException") {
        setNeedsConfirm(true)
      }
      setError(err instanceof Error ? err.message : "Sign-in failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title={t.authSignInTitle}>
      {justConfirmed && (
        <div className="rounded-inner border border-success bg-success-tint px-3.5 py-2.5 text-sm text-ink">
          {t.accountConfirmedHint}
        </div>
      )}

      <GoogleAuthSection onError={setError} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-inner border border-error bg-error-tint px-3.5 py-2.5 text-sm text-ink"
          >
            <div>{error}</div>
            {needsConfirm && (
              <Link
                to={`/confirm?email=${encodeURIComponent(email.trim())}`}
                className="mt-1.5 inline-block text-xs font-medium text-accent underline hover:text-accent-hi"
              >
                {t.confirmNeededLink}
              </Link>
            )}
          </div>
        )}

        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink">
            {t.emailLabel}
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            required
            enterKeyHint="next"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="dusk-field w-full px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-ink">
            {t.passwordLabel}
          </label>
          <div className="relative">
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={authEnabled() ? 8 : 1}
              enterKeyHint="done"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="dusk-field w-full py-2.5 pr-24 pl-3.5 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-1 right-1 inline-flex items-center gap-1 rounded-inner px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
            >
              {showPassword ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.hidePassword}</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.showPassword}</span>
                </>
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="dusk-pill-primary w-full px-5 py-2.5 text-sm"
        >
          {t.signInBtn}
        </button>
      </form>

      <div className="pt-1 text-center text-sm text-ink-2">
        <Link to="/signup" className="font-medium text-accent underline hover:text-accent-hi">
          {t.toSignUp}
        </Link>
      </div>
    </AuthShell>
  )
}

export function SignUpPage() {
  const [lang] = useLanguage()
  const t = COPY[lang]
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const trimmedEmail = email.trim()
      const confirmed = await signUp(trimmedEmail, password, name)
      if (confirmed) {
        await signIn(trimmedEmail, password)
        navigate("/", { replace: true })
      } else {
        setPendingSignUpPassword(trimmedEmail, password)
        navigate(`/confirm?email=${encodeURIComponent(trimmedEmail)}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title={t.authSignUpTitle}>
      <GoogleAuthSection onError={setError} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-inner border border-error bg-error-tint px-3.5 py-2.5 text-sm text-ink"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-ink">
            {t.nameLabel}
          </label>
          <input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            enterKeyHint="next"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="dusk-field w-full px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-ink">
            {t.emailLabel}
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            required
            enterKeyHint="next"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="dusk-field w-full px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-ink">
            {t.passwordLabel}
          </label>
          <div className="relative">
            <input
              id="signup-password"
              name="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              enterKeyHint="done"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="dusk-field w-full py-2.5 pr-24 pl-3.5 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute inset-y-1 right-1 inline-flex items-center gap-1 rounded-inner px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
            >
              {showPassword ? t.hidePassword : t.showPassword}
            </button>
          </div>
          {authEnabled() && (
            <p className="mt-1.5 text-xs text-ink-2">{t.passwordHintCognito}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="dusk-pill-primary w-full px-5 py-2.5 text-sm"
        >
          {t.signUpBtn}
        </button>
      </form>

      <div className="pt-1 text-center text-sm text-ink-2">
        <Link to="/login" className="font-medium text-accent underline hover:text-accent-hi">
          {t.toSignIn}
        </Link>
      </div>
    </AuthShell>
  )
}

export function ConfirmPage() {
  const [lang] = useLanguage()
  const t = COPY[lang]
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const trimmedEmail = email.trim()
    try {
      await confirmSignUp(trimmedEmail, code.trim())
      const pendingPassword = consumePendingSignUpPassword(trimmedEmail)
      if (pendingPassword) {
        try {
          await signIn(trimmedEmail, pendingPassword)
          navigate("/", { replace: true })
          return
        } catch {
          // Fall back to login page with email pre-filled if automatic sign-in fails
        }
      }
      navigate(`/login?email=${encodeURIComponent(trimmedEmail)}&confirmed=1`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed")
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError(null)
    setInfo(null)
    try {
      await resendConfirmationCode(email.trim())
      setInfo(t.codeResent)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code")
    }
  }

  return (
    <AuthShell title={t.authConfirmTitle}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-inner border border-error bg-error-tint px-3.5 py-2.5 text-sm text-ink"
          >
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-inner border border-success bg-success-tint px-3.5 py-2.5 text-sm text-ink">
            {info}
          </div>
        )}

        <div>
          <label htmlFor="confirm-email" className="mb-1.5 block text-sm font-medium text-ink">
            {t.emailLabel}
          </label>
          <input
            id="confirm-email"
            name="email"
            type="email"
            autoComplete="username"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="dusk-field w-full px-3.5 py-2.5 text-sm"
          />
        </div>

        <div>
          <label htmlFor="confirm-code" className="mb-1.5 block text-sm font-medium text-ink">
            {t.codeLabel}
          </label>
          <input
            id="confirm-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="dusk-field w-full px-3.5 py-2.5 text-base tabular-nums"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="dusk-pill-primary w-full px-5 py-2.5 text-sm"
        >
          {t.confirmBtn}
        </button>

        <button
          type="button"
          onClick={handleResend}
          className="w-full py-1 text-center text-xs font-medium text-accent underline hover:text-accent-hi"
        >
          {t.resendCode}
        </button>
      </form>
    </AuthShell>
  )
}

export function AuthCallbackPage() {
  const [lang] = useLanguage()
  const t = COPY[lang]
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const oauthErrorCode = searchParams.get("error")
  const redirectError =
    code && state
      ? null
      : oauthErrorCode === "access_denied"
        ? t.oauthAccessDenied
        : t.googleSignInFailed
  const [exchangeError, setExchangeError] = useState<string | null>(null)
  const error = redirectError ?? exchangeError
  const started = useRef(false)

  useEffect(() => {
    if (!code || !state || started.current) return
    started.current = true
    completeOAuthSignIn(code, state)
      .then(() => navigate("/", { replace: true }))
      .catch((err: Error) => setExchangeError(err.message))
  }, [code, state, navigate])

  return (
    <AuthShell title={t.authSignInTitle}>
      {error ? (
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-inner border border-error bg-error-tint px-3.5 py-2.5 text-sm text-ink"
          >
            {error}
          </div>
          <Link
            to="/login"
            className="block text-center text-sm font-medium text-accent underline hover:text-accent-hi"
          >
            {t.backToSignIn}
          </Link>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2.5 py-6 text-sm text-ink-2">
          <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
          <span>{t.signingInGoogle}</span>
        </div>
      )}
    </AuthShell>
  )
}
