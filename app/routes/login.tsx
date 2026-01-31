import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authClient } from "~/lib/auth-client";
import { getControlPlaneUrl } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Login – Studojo" },
    {
      name: "description",
      content: "Admin panel login",
    },
  ];
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    // Check for token in URL fragment (from redirect flow)
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const tokenMatch = hash.match(/token=([^&]+)/);
      if (tokenMatch) {
        const token = decodeURIComponent(tokenMatch[1]);
        // Store token in sessionStorage
        sessionStorage.setItem("admin_token", token);
        // Remove token from URL
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        // Check admin access
        checkAdminAndRedirect();
      }
    }
  }, []);

  useEffect(() => {
    // Check for error in URL params
    const errorParam = searchParams.get("error");
    if (errorParam === "not_admin") {
      setError("You do not have admin access. Please contact an administrator.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isPending && session) {
      // Check if user is admin
      checkAdminAndRedirect();
    }
  }, [isPending, session]);

  const checkAdminAndRedirect = async () => {
    if (!session?.user) return;
    
    try {
      const { data: tokenData } = await authClient.token();
      if (!tokenData?.token) {
        setError("Failed to get authentication token");
        return;
      }

      const controlPlaneUrl = getControlPlaneUrl();
      const response = await fetch(`${controlPlaneUrl}/v1/admin/users?limit=1`, {
        headers: {
          Authorization: `Bearer ${tokenData.token}`,
        },
      });

      if (response.ok) {
        const redirectTo = searchParams.get("redirect") || "/";
        navigate(redirectTo, { replace: true });
      } else {
        setError("You do not have admin access. Please contact an administrator.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify admin access");
    }
  };

  useEffect(() => {
    if (!isPending && session) {
      // Check if user is admin
      checkAdminAndRedirect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, session]);


  const handleGoogleSignIn = () => {
    setError(null);
    // Use the admin panel URL as callback so we redirect back here after OAuth
    const callbackURL = typeof window !== "undefined" 
      ? `${window.location.origin}/login`
      : "/login";
    authClient.signIn.social({
      provider: "google",
      callbackURL,
    });
  };

  if (!isPending && session) {
    // Already logged in, checking admin access
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
          <p className="font-['Satoshi'] text-sm text-gray-600">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950">
            Studojo Admin
          </h1>
          <p className="mt-2 font-['Satoshi'] text-sm font-normal leading-6 text-gray-600">
            Sign in to access the admin panel
          </p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] outline outline-2 outline-offset-[-2px] outline-black">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 border-2 border-red-200 p-3">
              <p className="font-['Satoshi'] text-sm font-medium text-red-900">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-neutral-900 bg-white font-['Satoshi'] text-sm font-medium leading-5 text-neutral-950 transition-transform hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 font-['Satoshi'] text-gray-500">Or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                // Redirect to frontend to get token if already logged in
                let frontendUrl = "http://localhost:3000";
                if (typeof window !== "undefined") {
                  const host = window.location.hostname;
                  const port = window.location.port;
                  const protocol = window.location.protocol;
                  
                  // Handle local development
                  if (port === "3001" || window.location.port === "3001") {
                    frontendUrl = `http://${host}:3000`;
                  } else if (host.startsWith("admin.")) {
                    // Handle production subdomain: admin.studojo.pro -> studojo.pro
                    const baseHost = host.replace(/^admin\./, "");
                    frontendUrl = `${protocol}//${baseHost}`;
                  } else if (window.location.origin.includes(":3001")) {
                    frontendUrl = window.location.origin.replace(":3001", ":3000");
                  } else {
                    frontendUrl = window.location.origin;
                  }
                }
                const redirectUrl = `${frontendUrl}/api/auth/share-token-redirect?redirect=${encodeURIComponent(window.location.href)}`;
                window.location.href = redirectUrl;
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-500 bg-violet-50 font-['Satoshi'] text-sm font-medium leading-5 text-violet-700 transition-transform hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              Use credentials from main app
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

