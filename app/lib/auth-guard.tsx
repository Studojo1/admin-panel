import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { authClient } from "./auth-client";
import { getToken, getControlPlaneUrl } from "./api";

export function useAdminGuard() {
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const { data: session, isPending } = authClient.useSession();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    
    const checkAuth = async () => {
      if (isPending) return;

      if (!session?.user) {
        checkedRef.current = true;
        navigate("/login?redirect=" + encodeURIComponent(window.location.pathname), { replace: true });
        return;
      }

      // Check if user has admin role
      try {
        const token = await getToken();
        if (!token) {
          checkedRef.current = true;
          navigate("/login?redirect=" + encodeURIComponent(window.location.pathname), { replace: true });
          return;
        }

        const base = getControlPlaneUrl();
        const response = await fetch(`${base}/v1/admin/users?limit=1`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          checkedRef.current = true;
          setIsAuthorized(true);
        } else {
          // User is not admin
          checkedRef.current = true;
          navigate("/login?error=not_admin", { replace: true });
        }
      } catch (error) {
        console.error("Admin check failed:", error);
        checkedRef.current = true;
        navigate("/login?redirect=" + encodeURIComponent(window.location.pathname), { replace: true });
      }
    };

    checkAuth();
  }, [session, isPending]);

  return { isAuthorized, isPending };
}

