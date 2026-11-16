import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api } from "@/lib/api"
import { isSignedIn } from "@/lib/auth"
import { AuthCallbackPage, ConfirmPage, LoginPage, SignUpPage } from "@/pages/AuthPages"

describe("LoginPage Dusk ridge & pointer parallax", () => {
  it("renders Tre Cime cliff hero, compact 380px glass card, attribution, and updates pointer parallax vars", async () => {
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0)
        return 1
      })

    try {
      const { container } = render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>,
      )

      const brandLink = screen.getByRole("link", { name: "Sharp" })
      expect(brandLink.querySelector("svg")).not.toBeNull()

      const imgs = Array.from(container.querySelectorAll("[data-slot='hero'] img"))
      expect(imgs.map((el) => el.getAttribute("src"))).toEqual([
        "/dusk-sky.webp",
        "/dusk-peaks.webp",
        "/dusk-mist.webp",
      ])
      expect(imgs[0]?.getAttribute("fetchpriority")).toBe("high")
      expect(imgs[1]?.getAttribute("fetchpriority")).toBe("high")
      expect(imgs[1]?.getAttribute("alt")).toContain("Tre Cime")

      expect(screen.getByText("Допомагати вам, а не замінювати вас.")).toBeInTheDocument()
      expect(screen.queryByText(/Три точні питання/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Дегуманізований когнітивний/i)).not.toBeInTheDocument()

      expect(screen.getByRole("link", { name: "Wolfgang Moroder" })).toHaveAttribute(
        "href",
        "https://commons.wikimedia.org/wiki/File:Drei_Zinnen_Tre_Cime_di_Lavaredo_Dolomites.jpg",
      )

      const glassPane = container.querySelector(".dusk-glass-pane")
      expect(glassPane?.className).toContain("max-w-[380px]")

      const main = container.querySelector("main") as HTMLElement
      expect(main).not.toBeNull()
      vi.spyOn(main, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
        right: 1000,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      fireEvent(
        main,
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: 900,
          clientY: 200,
          pointerType: "mouse",
        }),
      )

      await waitFor(() => {
        expect(Number(main.style.getPropertyValue("--px"))).toBeCloseTo(0.8, 2)
        expect(Number(main.style.getPropertyValue("--py"))).toBeCloseTo(-0.5, 2)
      })

      fireEvent.pointerLeave(main)

      await waitFor(() => {
        expect(main.style.getPropertyValue("--px")).toBe("0.0000")
        expect(main.style.getPropertyValue("--py")).toBe("0.0000")
      })
    } finally {
      rafSpy.mockRestore()
    }
  })
})

describe("Cognito auth mode behavior", () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem("sharp.lang", "uk")
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("rejects stale empty local-dev sessions when Cognito is enabled", () => {
    localStorage.setItem(
      "sharp.session",
      JSON.stringify({ idToken: "", expiresAt: Number.MAX_SAFE_INTEGER }),
    )
    expect(isSignedIn()).toBe(true)

    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-123")
    expect(isSignedIn()).toBe(false)

    localStorage.setItem(
      "sharp.session",
      JSON.stringify({ idToken: "jwt-token", expiresAt: Date.now() + 60_000 }),
    )
    expect(isSignedIn()).toBe(true)
  })

  it("signs out and dispatches sharp-auth-expired on 401 when Cognito is enabled", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-123")
    localStorage.setItem(
      "sharp.session",
      JSON.stringify({ idToken: "expired-or-bad", expiresAt: Date.now() + 120_000 }),
    )

    const expiredListener = vi.fn()
    window.addEventListener("sharp-auth-expired", expiredListener)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Sign in required" }), { status: 401 }),
    )

    try {
      await expect(api.getMe()).rejects.toThrow("Sign in required")
      expect(localStorage.getItem("sharp.session")).toBeNull()
      expect(expiredListener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener("sharp-auth-expired", expiredListener)
    }
  })

  it("shows confirmation link when Cognito returns UserNotConfirmedException", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-123")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          __type: "UserNotConfirmedException",
          message: "User is not confirmed.",
        }),
        { status: 400 },
      ),
    )

    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText("Електронна пошта"), "user@example.com")
    await user.type(screen.getByLabelText("Пароль"), "secret123")
    await user.click(screen.getByRole("button", { name: "Увійти" }))

    const confirmLink = await screen.findByRole("link", { name: "Ввести код підтвердження" })
    expect(confirmLink).toHaveAttribute("href", "/confirm?email=user%40example.com")
  })

  it("auto-signs in immediately after confirming email from SignUpPage without re-entering credentials", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-123")
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const target = (init?.headers as Record<string, string>)["X-Amz-Target"]
      if (target?.endsWith("SignUp")) {
        return new Response(JSON.stringify({ UserConfirmed: false }), { status: 200 })
      }
      if (target?.endsWith("ConfirmSignUp")) {
        return new Response(JSON.stringify({}), { status: 200 })
      }
      if (target?.endsWith("InitiateAuth")) {
        return new Response(
          JSON.stringify({
            AuthenticationResult: {
              IdToken: "auto-id-token",
              RefreshToken: "auto-refresh-token",
              ExpiresIn: 3600,
            },
          }),
          { status: 200 },
        )
      }
      return new Response("{}", { status: 400 })
    })

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={["/signup"]}>
        <Routes>
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/" element={<div>WORKSPACE_HOME</div>} />
          <Route path="/login" element={<div>LOGIN_FALLBACK</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText("Ваше ім'я"), "Іван")
    await user.type(screen.getByLabelText("Електронна пошта"), "ivan@example.com")
    await user.type(screen.getByLabelText("Пароль"), "secret123")
    await user.click(screen.getByRole("button", { name: "Зареєструватися" }))

    await screen.findByLabelText("6-значний код з листа")
    await user.type(screen.getByLabelText("6-значний код з листа"), "654321")
    await user.click(screen.getByRole("button", { name: "Підтвердити email" }))

    expect(await screen.findByText("WORKSPACE_HOME")).toBeInTheDocument()
    expect(isSignedIn()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("renders Google button when enabled and completes PKCE OAuth callback", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-123")
    vi.stubEnv("VITE_COGNITO_DOMAIN", "sharp-test.auth.us-east-1.amazoncognito.com")
    vi.stubEnv("VITE_COGNITO_GOOGLE", "true")

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole("button", { name: "Продовжити з Google" })).toBeInTheDocument()

    sessionStorage.setItem(
      "sharp.pkce",
      JSON.stringify({ verifier: "verifier-123", state: "state-abc" }),
    )
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: "google-id-jwt",
          refresh_token: "google-refresh",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    )

    render(
      <MemoryRouter initialEntries={["/auth/callback?code=auth-code-1&state=state-abc"]}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<div>WORKSPACE_AFTER_GOOGLE</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText("WORKSPACE_AFTER_GOOGLE")).toBeInTheDocument()
    expect(isSignedIn()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sharp-test.auth.us-east-1.amazoncognito.com/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("toggles light theme cleanly, keeps signup password out of history.state, and blocks callback phishing text", async () => {
    const user = userEvent.setup()
    localStorage.removeItem("sharp.theme")
    document.documentElement.dataset.theme = "dark"

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const themeBtn = screen.getByRole("button", { name: "Увімкнути світлу тему" })
    await user.click(themeBtn)
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(document.documentElement.classList.contains("light")).toBe(true)
    expect(localStorage.getItem("sharp.theme")).toBe("light")

    await user.click(screen.getByRole("button", { name: "Увімкнути темну тему" }))
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(document.documentElement.classList.contains("light")).toBe(false)

    expect(JSON.stringify(window.history.state ?? {})).not.toContain("secret123")

    render(
      <MemoryRouter
        initialEntries={[
          "/auth/callback?error=server_error&error_description=Phishing+Transfer+Funds",
        ]}
      >
        <AuthCallbackPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/Phishing Transfer Funds/i)).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Не вдалося увійти через Google")
  })

  it("rejects OAuth callback when OIDC nonce mismatches", async () => {
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-123")
    vi.stubEnv("VITE_COGNITO_DOMAIN", "sharp-test.auth.us-east-1.amazoncognito.com")

    const header = btoa(JSON.stringify({ alg: "RS256" }))
    const payload = btoa(JSON.stringify({ sub: "u1", nonce: "wrong-nonce" }))
    sessionStorage.setItem(
      "sharp.pkce",
      JSON.stringify({ verifier: "verifier-1", state: "state-1", nonce: "expected-nonce" }),
    )
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id_token: `${header}.${payload}.sig`, expires_in: 3600 }),
        { status: 200 },
      ),
    )

    render(
      <MemoryRouter initialEntries={["/auth/callback?code=c1&state=state-1"]}>
        <AuthCallbackPage />
      </MemoryRouter>,
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Sign-in verification failed/i,
    )
    expect(isSignedIn()).toBe(false)
  })
})
