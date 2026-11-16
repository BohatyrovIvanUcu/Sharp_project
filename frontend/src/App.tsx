import { useEffect } from "react"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router"
import { isSignedIn } from "@/lib/auth"
import { AuthCallbackPage, ConfirmPage, LoginPage, SignUpPage } from "@/pages/AuthPages"
import { WorkspacePage } from "@/pages/WorkspacePage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear()
      navigate("/login", { replace: true })
    }
    window.addEventListener("sharp-auth-expired", onExpired)
    return () => window.removeEventListener("sharp-auth-expired", onExpired)
  }, [navigate, queryClient])

  if (!isSignedIn()) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <WorkspacePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
