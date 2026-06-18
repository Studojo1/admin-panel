import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, UNSAFE_withComponentProps, Outlet, UNSAFE_withErrorBoundaryProps, isRouteErrorResponse, Meta, Links, ScrollRestoration, Scripts, useLocation, useNavigate, Link, useSearchParams } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { Toaster, toast as toast$1 } from "sonner";
import { useState, useRef, useEffect, createContext, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiX } from "react-icons/fi";
import { Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler, ArcElement } from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { lastLoginMethodClient, jwtClient, adminClient, phoneNumberClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { importJWK, jwtVerify } from "jose";
const streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders
    });
  }
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");
    let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    let timeoutId = setTimeout(
      () => abort(),
      streamTimeout + 1e3
    );
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: routerContext, url: request.url }),
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = void 0;
              callback();
            }
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
function AlertModal({ isOpen, message, onClose }) {
  return /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        onClick: onClose,
        className: "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      }
    ),
    /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.95, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 20 },
        transition: { duration: 0.2 },
        className: "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h2", { className: "font-['Clash_Display'] text-xl font-bold text-neutral-900", children: "Alert" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onClose,
                className: "rounded-lg border-2 border-neutral-900 bg-white p-2 transition-colors hover:bg-gray-50",
                "aria-label": "Close",
                children: /* @__PURE__ */ jsx(FiX, { className: "h-5 w-5" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mb-6 font-['Satoshi'] text-sm text-neutral-700", children: message }),
          /* @__PURE__ */ jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsx(
            "button",
            {
              onClick: onClose,
              className: "rounded-lg border-2 border-neutral-900 bg-violet-600 px-6 py-2 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700",
              children: "OK"
            }
          ) })
        ]
      }
    )
  ] }) });
}
function ConfirmModal({
  isOpen,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel"
}) {
  return /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        onClick: onCancel,
        className: "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      }
    ),
    /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.95, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 20 },
        transition: { duration: 0.2 },
        className: "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h2", { className: "font-['Clash_Display'] text-xl font-bold text-neutral-900", children: "Confirm" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onCancel,
                className: "rounded-lg border-2 border-neutral-900 bg-white p-2 transition-colors hover:bg-gray-50",
                "aria-label": "Close",
                children: /* @__PURE__ */ jsx(FiX, { className: "h-5 w-5" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx("p", { className: "mb-6 font-['Satoshi'] text-sm text-neutral-700", children: message }),
          /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onCancel,
                className: "flex-1 rounded-lg border-2 border-neutral-900 bg-white px-6 py-2 font-['Satoshi'] font-medium text-neutral-900 transition-colors hover:bg-neutral-100",
                children: cancelText
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onConfirm,
                className: "flex-1 rounded-lg border-2 border-neutral-900 bg-violet-600 px-6 py-2 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700",
                children: confirmText
              }
            )
          ] })
        ]
      }
    )
  ] }) });
}
function PromptModal({
  isOpen,
  message,
  defaultValue = "",
  onConfirm,
  onCancel,
  confirmText = "Submit",
  cancelText = "Cancel",
  placeholder = ""
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);
  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultValue]);
  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(value);
  };
  return /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        onClick: onCancel,
        className: "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      }
    ),
    /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.95, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 20 },
        transition: { duration: 0.2 },
        className: "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h2", { className: "font-['Clash_Display'] text-xl font-bold text-neutral-900", children: "Prompt" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onCancel,
                className: "rounded-lg border-2 border-neutral-900 bg-white p-2 transition-colors hover:bg-gray-50",
                "aria-label": "Close",
                children: /* @__PURE__ */ jsx(FiX, { className: "h-5 w-5" })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, children: [
            /* @__PURE__ */ jsx("p", { className: "mb-4 font-['Satoshi'] text-sm text-neutral-700", children: message }),
            /* @__PURE__ */ jsx(
              "input",
              {
                ref: inputRef,
                type: "text",
                value,
                onChange: (e) => setValue(e.target.value),
                placeholder,
                className: "mb-6 w-full rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "flex gap-4", children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: onCancel,
                  className: "flex-1 rounded-lg border-2 border-neutral-900 bg-white px-6 py-2 font-['Satoshi'] font-medium text-neutral-900 transition-colors hover:bg-neutral-100",
                  children: cancelText
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "submit",
                  className: "flex-1 rounded-lg border-2 border-neutral-900 bg-violet-600 px-6 py-2 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700",
                  children: confirmText
                }
              )
            ] })
          ] })
        ]
      }
    )
  ] }) });
}
const ModalContext = createContext(void 0);
function ModalProvider({ children }) {
  const [alertState, setAlertState] = useState({
    isOpen: false,
    message: ""
  });
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    message: ""
  });
  const [promptState, setPromptState] = useState({
    isOpen: false,
    message: ""
  });
  const [alertResolve, setAlertResolve] = useState(null);
  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      setAlertResolve(() => resolve);
      setAlertState({ isOpen: true, message });
    });
  }, []);
  const showConfirm = useCallback(
    (message, confirmText, cancelText) => {
      return new Promise((resolve) => {
        setConfirmState({
          isOpen: true,
          message,
          confirmText,
          cancelText,
          resolve
        });
      });
    },
    []
  );
  const showPrompt = useCallback(
    (message, defaultValue, placeholder, confirmText, cancelText) => {
      return new Promise((resolve) => {
        setPromptState({
          isOpen: true,
          message,
          defaultValue,
          placeholder,
          confirmText,
          cancelText,
          resolve
        });
      });
    },
    []
  );
  const handleAlertClose = () => {
    if (alertResolve) {
      alertResolve();
      setAlertResolve(null);
    }
    setAlertState({ isOpen: false, message: "" });
  };
  const handleConfirm = () => {
    if (confirmState.resolve) {
      confirmState.resolve(true);
    }
    setConfirmState({ isOpen: false, message: "" });
  };
  const handleCancel = () => {
    if (confirmState.resolve) {
      confirmState.resolve(false);
    }
    setConfirmState({ isOpen: false, message: "" });
  };
  const handlePromptConfirm = (value) => {
    if (promptState.resolve) {
      promptState.resolve(value);
    }
    setPromptState({ isOpen: false, message: "" });
  };
  const handlePromptCancel = () => {
    if (promptState.resolve) {
      promptState.resolve(null);
    }
    setPromptState({ isOpen: false, message: "" });
  };
  return /* @__PURE__ */ jsxs(ModalContext.Provider, { value: { showAlert, showConfirm, showPrompt }, children: [
    children,
    /* @__PURE__ */ jsx(
      AlertModal,
      {
        isOpen: alertState.isOpen,
        message: alertState.message,
        onClose: handleAlertClose
      }
    ),
    /* @__PURE__ */ jsx(
      ConfirmModal,
      {
        isOpen: confirmState.isOpen,
        message: confirmState.message,
        confirmText: confirmState.confirmText,
        cancelText: confirmState.cancelText,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      }
    ),
    /* @__PURE__ */ jsx(
      PromptModal,
      {
        isOpen: promptState.isOpen,
        message: promptState.message,
        defaultValue: promptState.defaultValue,
        placeholder: promptState.placeholder,
        confirmText: promptState.confirmText,
        cancelText: promptState.cancelText,
        onConfirm: handlePromptConfirm,
        onCancel: handlePromptCancel
      }
    )
  ] });
}
const links = () => [{
  rel: "icon",
  href: "/favicon.png",
  type: "image/png"
}, {
  rel: "preconnect",
  href: "https://api.fontshare.com"
}, {
  rel: "stylesheet",
  href: "https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&f[]=satoshi@400,500,700,900&display=swap"
}];
function Layout({
  children
}) {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [children, /* @__PURE__ */ jsx(Toaster, {
        position: "top-right",
        toastOptions: {
          classNames: {
            toast: "font-['Satoshi']",
            title: "font-['Satoshi'] font-medium",
            description: "font-['Satoshi']",
            success: "bg-emerald-50 border-emerald-200 text-emerald-900",
            error: "bg-red-50 border-red-200 text-red-900",
            info: "bg-blue-50 border-blue-200 text-blue-900"
          }
        }
      }), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
}
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsx(ModalProvider, {
    children: /* @__PURE__ */ jsx(Outlet, {})
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2({
  error
}) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack;
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  }
  return /* @__PURE__ */ jsxs("main", {
    className: "pt-16 p-4 container mx-auto",
    children: [/* @__PURE__ */ jsx("h1", {
      children: message
    }), /* @__PURE__ */ jsx("p", {
      children: details
    }), stack]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  Layout,
  default: root,
  links
}, Symbol.toStringTag, { value: "Module" }));
const getAuthBaseURL = () => {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (port === "3001" || window.location.port === "3001") {
      return `http://${host}:3000`;
    }
    if (host.startsWith("admin.")) {
      const baseHost = host.replace(/^admin\./, "");
      return `${protocol}//${baseHost}`;
    }
    if (window.location.origin.includes(":3001")) {
      return window.location.origin.replace(":3001", ":3000");
    }
    return window.location.origin;
  }
  return process.env.VITE_AUTH_URL || "http://localhost:3000";
};
const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  plugins: [
    lastLoginMethodClient(),
    jwtClient(),
    adminClient(),
    phoneNumberClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        if (typeof window !== "undefined") {
          window.location.href = "/auth/2fa";
        }
      }
    })
  ]
});
const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/users", label: "Users" },
  { to: "/daily", label: "Daily Dashboard" },
  { to: "/funnel", label: "Funnel" },
  { to: "/journeys", label: "User Journeys" },
  { to: "/outreach-orders", label: "Outreach Orders" },
  { to: "/campaign-health", label: "Campaign Health" },
  { to: "/paid-users", label: "Paid Users" },
  { to: "/outreach", label: "Outreach Stats" },
  { to: "/chat-logs", label: "Chat Logs" },
  { to: "/ops-alerts", label: "Ops Alerts" },
  { to: "/tickets", label: "Tickets" },
  { to: "/webinar-registrations", label: "Webinar Signups" },
  { to: "/email-sequences", label: "Emails" },
  { to: "/analytics", label: "Analytics" },
  { to: "/utm-builder", label: "UTM Builder" },
  { to: "/coupons", label: "Coupons" },
  { to: "/career-coach", label: "Career Coach" },
  { to: "/settings", label: "Settings" }
];
function AdminHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const currentLink = NAV_LINKS.find((l) => l.to === location.pathname) ?? { label: "Navigate" };
  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  const handleSignOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate("/login")
      }
    });
  };
  return /* @__PURE__ */ jsx(
    motion.header,
    {
      initial: { y: -100, opacity: 0 },
      animate: { y: 0, opacity: 1 },
      transition: { duration: 0.5, ease: "easeOut" },
      className: "sticky top-0 z-50 w-full border-b-2 border-neutral-900 bg-white shadow-[0_4px_0px_0px_rgba(25,26,35,1)]",
      children: /* @__PURE__ */ jsxs("div", { className: "mx-auto flex h-16 max-w-[var(--section-max-width)] items-center justify-between px-4 md:h-20 md:px-8", children: [
        /* @__PURE__ */ jsx(
          motion.div,
          {
            whileHover: { scale: 1.05 },
            transition: { type: "spring", stiffness: 400, damping: 17 },
            children: /* @__PURE__ */ jsx(
              Link,
              {
                to: "/",
                className: "font-['Satoshi'] text-2xl font-black leading-9 text-neutral-900 md:text-4xl md:leading-7",
                children: "Studojo Admin"
              }
            )
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "relative", ref: menuRef, children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setMenuOpen((prev) => !prev),
                className: "flex items-center gap-2 rounded-xl border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-semibold text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]",
                children: [
                  /* @__PURE__ */ jsx("span", { children: currentLink.label }),
                  /* @__PURE__ */ jsx(
                    motion.svg,
                    {
                      animate: { rotate: menuOpen ? 180 : 0 },
                      transition: { duration: 0.2 },
                      width: "14",
                      height: "14",
                      viewBox: "0 0 24 24",
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: "2.5",
                      strokeLinecap: "round",
                      strokeLinejoin: "round",
                      children: /* @__PURE__ */ jsx("polyline", { points: "6 9 12 15 18 9" })
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsx(AnimatePresence, { children: menuOpen && /* @__PURE__ */ jsx(
              motion.div,
              {
                initial: { opacity: 0, y: -8, scale: 0.97 },
                animate: { opacity: 1, y: 0, scale: 1 },
                exit: { opacity: 0, y: -8, scale: 0.97 },
                transition: { duration: 0.15 },
                className: "absolute right-0 top-full mt-2 w-52 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] max-h-[calc(100vh-6rem)]",
                children: NAV_LINKS.map((link) => {
                  const isActive = location.pathname === link.to;
                  return /* @__PURE__ */ jsx(
                    Link,
                    {
                      to: link.to,
                      className: `block px-4 py-2.5 font-['Satoshi'] text-sm transition-colors ${isActive ? "bg-violet-500 font-semibold text-white" : "font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"}`,
                      children: link.label
                    },
                    link.to
                  );
                })
              }
            ) })
          ] }),
          /* @__PURE__ */ jsx(
            motion.a,
            {
              href: "https://studojo.com/api/admin/email-dashboard-sso",
              initial: { opacity: 0, scale: 0.9 },
              animate: { opacity: 1, scale: 1 },
              transition: { duration: 0.3 },
              whileHover: { scale: 1.05 },
              whileTap: { scale: 0.95 },
              className: "rounded-lg border-2 border-violet-600 bg-violet-600 px-4 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-white shadow-[2px_2px_0px_0px_rgba(109,40,217,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(109,40,217,1)]",
              children: "✉ Email"
            }
          ),
          session && /* @__PURE__ */ jsx(
            motion.button,
            {
              initial: { opacity: 0, scale: 0.9 },
              animate: { opacity: 1, scale: 1 },
              transition: { duration: 0.3 },
              whileHover: { scale: 1.05 },
              whileTap: { scale: 0.95 },
              onClick: handleSignOut,
              className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: "Sign Out"
            }
          )
        ] })
      ] })
    }
  );
}
const colorClasses = {
  purple: "bg-purple-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  pink: "bg-pink-500",
  yellow: "bg-yellow-500"
};
function StatCard$2({ value, label, color = "purple", delay = 0 }) {
  return /* @__PURE__ */ jsx(
    motion.div,
    {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.5, delay, ease: "easeOut" },
      whileHover: { scale: 1.02, y: -4 },
      className: `rounded-2xl border-2 border-neutral-900 ${colorClasses[color]} p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]`,
      children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-2", children: [
        /* @__PURE__ */ jsx("span", { className: "font-['Clash_Display'] text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl", children: typeof value === "number" ? value.toLocaleString() : value }),
        /* @__PURE__ */ jsx("span", { className: "font-['Satoshi'] text-base font-medium leading-6 text-white/90 md:text-lg", children: label })
      ] })
    }
  );
}
function SearchInput({
  value = "",
  onChange,
  onSearch,
  placeholder = "Search...",
  debounceMs = 300
}) {
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      onChange?.(localValue);
      onSearch?.(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, debounceMs, onChange, onSearch]);
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  return /* @__PURE__ */ jsxs(
    motion.div,
    {
      initial: { opacity: 0, x: -10 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.3 },
      className: "relative w-full max-w-md",
      children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            value: localValue,
            onChange: (e) => setLocalValue(e.target.value),
            placeholder,
            className: "w-full rounded-2xl border-2 border-neutral-900 bg-white px-4 py-3 pl-10 font-['Satoshi'] text-base font-normal leading-6 text-neutral-900 placeholder:text-neutral-500 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]"
          }
        ),
        /* @__PURE__ */ jsx(
          "svg",
          {
            className: "absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500",
            fill: "none",
            stroke: "currentColor",
            viewBox: "0 0 24 24",
            children: /* @__PURE__ */ jsx(
              "path",
              {
                strokeLinecap: "round",
                strokeLinejoin: "round",
                strokeWidth: 2,
                d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              }
            )
          }
        )
      ]
    }
  );
}
function UserDetailModal({
  user,
  isOpen,
  onClose,
  onUpdate
}) {
  if (!user) return null;
  const formatDate2 = (dateString) => {
    return new Date(dateString).toLocaleString();
  };
  return /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        onClick: onClose,
        className: "fixed inset-0 z-50 bg-black/50"
      }
    ),
    /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.95, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 20 },
        transition: { duration: 0.2 },
        className: "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[8px_8px_0px_0px_rgba(25,26,35,1)] md:p-8",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-6 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h2", { className: "font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-900 md:text-3xl", children: "User Details" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onClose,
                className: "rounded-lg border-2 border-neutral-900 bg-white p-2 transition-transform hover:scale-110 hover:bg-neutral-50",
                "aria-label": "Close",
                children: /* @__PURE__ */ jsx(
                  "svg",
                  {
                    className: "h-5 w-5 text-neutral-900",
                    fill: "none",
                    stroke: "currentColor",
                    viewBox: "0 0 24 24",
                    children: /* @__PURE__ */ jsx(
                      "path",
                      {
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                        strokeWidth: 2,
                        d: "M6 18L18 6M6 6l12 12"
                      }
                    )
                  }
                )
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
            /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Basic Information" }),
              /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Name" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.name || "—" })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Email" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.email })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Phone Number" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.phone_number || "—" })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "User ID" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-xs font-mono text-neutral-600", children: user.id })
                ] })
              ] })
            ] }),
            (user.full_name || user.college || user.year_of_study || user.course) && /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Profile Information" }),
              /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                user.full_name && /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Full Name" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.full_name })
                ] }),
                user.college && /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "College" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.college })
                ] }),
                user.year_of_study && /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Year of Study" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.year_of_study })
                ] }),
                user.course && /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Course" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.course })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Account Status" }),
              /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Role" }),
                  /* @__PURE__ */ jsxs(
                    "select",
                    {
                      value: user.role || "",
                      onChange: async (e) => {
                        try {
                          await updateUser(user.id, {
                            role: e.target.value || null
                          });
                          toast.success("Role updated");
                          onUpdate();
                        } catch (error) {
                          toast.error(error.message || "Failed to update role");
                        }
                      },
                      className: "mt-1 rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium transition-colors hover:bg-neutral-50 focus:outline-none",
                      children: [
                        /* @__PURE__ */ jsx("option", { value: "", children: "User" }),
                        /* @__PURE__ */ jsx("option", { value: "ops", children: "Ops" }),
                        /* @__PURE__ */ jsx("option", { value: "admin", children: "Admin" }),
                        /* @__PURE__ */ jsx("option", { value: "dev", children: "Dev" })
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Status" }),
                  user.banned ? /* @__PURE__ */ jsx("span", { className: "inline-block rounded-lg bg-red-100 px-3 py-1 font-['Satoshi'] text-sm font-medium text-red-700", children: "Banned" }) : /* @__PURE__ */ jsx("span", { className: "inline-block rounded-lg bg-green-100 px-3 py-1 font-['Satoshi'] text-sm font-medium text-green-700", children: "Active" })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Email Verified" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.email_verified ? "Yes" : "No" })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Phone Verified" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.phone_number_verified ? "Yes" : "No" })
                ] })
              ] })
            ] }),
            user.banned && /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Ban Information" }),
              /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
                user.ban_reason && /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Ban Reason" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: user.ban_reason })
                ] }),
                user.ban_expires && /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Ban Expires" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: formatDate2(user.ban_expires) })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Timestamps" }),
              /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Created At" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-sm font-normal text-neutral-600", children: formatDate2(user.created_at) })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Last Updated" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-sm font-normal text-neutral-600", children: formatDate2(user.updated_at) })
                ] })
              ] })
            ] })
          ] })
        ]
      }
    )
  ] }) });
}
async function phQuery$6(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } })
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
const envWhere$2 = (e) => e === "prod" ? "AND properties.$host LIKE '%studojo.com%'" : e === "staging" ? "AND properties.$host LIKE '%studojo.pro%'" : "";
function sourceHogql(start, end, env = "all") {
  const IST = "toDate(timestamp + INTERVAL 330 MINUTE)";
  const timeWhere = start && end ? `${IST} >= toDate('${start}') AND ${IST} <= toDate('${end}')` : "1=1";
  return `
    SELECT
      multiIf(
        medium = 'email' OR position(src_raw, 'email') > 0 OR position(src_raw, 'newsletter') > 0 OR position(ref, 'mail') > 0, 'Email',
        src_raw != '', src_raw,
        ref != '' AND ref != '$direct', ref,
        'Direct'
      ) AS source,
      count() AS visitors,
      countIf(signed_up) AS users
    FROM (
      SELECT person_id,
        lower(coalesce(any(person.properties.$initial_utm_medium), '')) AS medium,
        lower(coalesce(any(person.properties.$initial_utm_source), '')) AS src_raw,
        lower(coalesce(any(person.properties.$initial_referring_domain), '')) AS ref,
        max(person.properties.email != '' AND person.properties.email IS NOT NULL) AS signed_up
      FROM events
      WHERE ${timeWhere} ${envWhere$2(env)}
      GROUP BY person_id
    )
    GROUP BY source
    ORDER BY users DESC, visitors DESC
    LIMIT 15`;
}
const pretty = (s) => {
  if (!s) return "Direct";
  if (s === "$direct") return "Direct";
  if (/^[a-z]+$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1);
  return s;
};
const COLORS = ["bg-violet-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-lime-500", "bg-orange-500"];
function SourceBreakdown({ start, end, env = "all", className = "" }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    phQuery$6(sourceHogql(start, end, env)).then((res) => {
      if (!cancelled) setRows((res.results ?? []).map((r) => ({ source: r[0], visitors: +r[1] || 0, users: +r[2] || 0 })));
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [start, end, env]);
  const totalUsers = rows.reduce((a, r) => a + r.users, 0);
  const max = Math.max(1, ...rows.map((r) => r.users));
  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
  return /* @__PURE__ */ jsxs("div", { className: `p-5 md:p-6 ${card} ${className}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-baseline justify-between mb-1", children: [
      /* @__PURE__ */ jsx("h2", { className: "font-['Clash_Display'] text-xl font-bold", children: "Where users come from" }),
      !loading && totalUsers > 0 && /* @__PURE__ */ jsxs("span", { className: "text-xs text-neutral-500", children: [
        totalUsers.toLocaleString(),
        " signed-up users"
      ] })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "text-xs text-neutral-500 mb-4", children: "First-touch source of every signed-up user. Ranked by users." }),
    loading ? /* @__PURE__ */ jsx("div", { className: "flex justify-center py-8", children: /* @__PURE__ */ jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" }) }) : error ? /* @__PURE__ */ jsx("p", { className: "text-sm text-neutral-400 py-4", children: "Couldn't load source data." }) : rows.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-neutral-400 py-4", children: "No attribution data in this range." }) : /* @__PURE__ */ jsx("div", { className: "space-y-2", children: rows.map((r, i) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "w-28 flex-shrink-0 text-sm font-semibold truncate", title: pretty(r.source), children: pretty(r.source) }),
      /* @__PURE__ */ jsx("div", { className: "flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200", children: /* @__PURE__ */ jsx("div", { className: `h-full ${COLORS[i % COLORS.length]} flex items-center px-2`, style: { width: `${Math.max(r.users / max * 100, r.users > 0 ? 6 : 0)}%` }, children: r.users > 0 && /* @__PURE__ */ jsx("span", { className: "text-xs font-bold text-white", children: r.users.toLocaleString() }) }) }),
      /* @__PURE__ */ jsxs("div", { className: "w-16 text-right text-xs font-semibold text-neutral-500", children: [
        totalUsers > 0 ? Math.round(r.users / totalUsers * 100) : 0,
        "%"
      ] })
    ] }, r.source)) })
  ] });
}
const __vite_import_meta_env__ = {};
function getControlPlaneUrl() {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    if (hostname.startsWith("admin.")) {
      const baseHost = hostname.replace(/^admin\./, "");
      return `${protocol}//api.${baseHost}`;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const url2 = __vite_import_meta_env__?.VITE_CONTROL_PLANE_URL;
      return typeof url2 === "string" && url2 ? url2 : "http://localhost:8080";
    }
    return `${protocol}//api.${hostname.replace(/^admin\./, "")}`;
  }
  const url = __vite_import_meta_env__?.VITE_CONTROL_PLANE_URL;
  return typeof url === "string" && url ? url : "http://localhost:8080";
}
function getFrontendUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (port === "3001" || window.location.port === "3001") {
      return `http://${host}:3000`;
    }
    if (host.startsWith("admin.")) {
      const baseHost = host.replace(/^admin\./, "");
      return `${protocol}//${baseHost}`;
    }
    if (window.location.origin.includes(":3001")) {
      return window.location.origin.replace(":3001", ":3000");
    }
    return window.location.origin;
  }
  return process.env.VITE_AUTH_URL || "http://localhost:3000";
}
async function getToken() {
  if (typeof window !== "undefined") {
    const storedToken = sessionStorage.getItem("admin_token");
    if (storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split(".")[1]));
        const exp = payload.exp * 1e3;
        if (exp > Date.now()) {
          return storedToken;
        } else {
          sessionStorage.removeItem("admin_token");
        }
      } catch (e) {
        sessionStorage.removeItem("admin_token");
      }
    }
  }
  try {
    const { data, error } = await authClient.token();
    if (!error && data?.token) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_token", data.token);
      }
      return data.token;
    }
  } catch (error) {
    console.debug("Failed to get token from Better Auth:", error);
  }
  try {
    const frontendUrl = getFrontendUrl();
    const response = await fetch(`${frontendUrl}/api/auth/share-token`, {
      method: "GET",
      credentials: "include",
      // Include cookies for same-origin requests
      mode: "cors",
      // Enable CORS
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("admin_token", data.token);
        }
        return data.token;
      }
    } else {
      console.debug("share-token endpoint returned:", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    console.debug("Failed to get token from frontend:", error);
  }
  return null;
}
async function adminFetch(endpoint, options = {}) {
  const token = await getToken();
  const base = getControlPlaneUrl();
  if (!token) {
    throw new Error("No authentication token available. Please sign in.");
  }
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers
    },
    credentials: "include"
  });
  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("admin_token");
      }
      throw new Error("Authentication failed. Please sign in again.");
    }
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }
  return response.json();
}
async function listUsers(limit = 50, offset = 0, search) {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString()
  });
  if (search) {
    params.append("search", search);
  }
  const response = await adminFetch(`/v1/admin/users?${params.toString()}`);
  return response.users || [];
}
async function getUser(id) {
  return adminFetch(`/v1/admin/users/${id}`);
}
async function updateUser$1(id, updates) {
  return adminFetch(`/v1/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });
}
async function outreachProxyFetch(type, params = {}) {
  const token = await getToken();
  if (!token) throw new Error("No authentication token available. Please sign in.");
  const qs = new URLSearchParams({ type, ...params, _t: Date.now().toString() }).toString();
  const fullUrl = `/api/outreach?${qs}`;
  const response = await fetch(fullUrl, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined") sessionStorage.removeItem("admin_token");
      throw new Error("Authentication failed. Please sign in again.");
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}
async function getOutreachOverview() {
  return outreachProxyFetch("overview");
}
async function listOutreachUsers(limit = 50, offset = 0, search, statusFilter) {
  const params = { limit: limit.toString(), offset: offset.toString() };
  if (search) params.search = search;
  if (statusFilter) params.status_filter = statusFilter;
  return outreachProxyFetch("users", params);
}
async function getOutreachUserDetail(userId) {
  return outreachProxyFetch("user_detail", { user_id: userId });
}
async function getAdminCampaignEmails(campaignId) {
  return outreachProxyFetch("campaign_emails", { campaign_id: campaignId.toString() });
}
async function listCareers(limit = 50, offset = 0) {
  const response = await adminFetch(`/v1/admin/careers?limit=${limit}&offset=${offset}`);
  return response.applications || [];
}
async function getDashboardStats() {
  return adminFetch(`/v1/admin/stats`);
}
async function listDissertations(limit = 50, offset = 0) {
  const response = await adminFetch(`/v1/admin/dissertations?limit=${limit}&offset=${offset}`);
  return response.submissions || [];
}
async function listScheduledEmails(status, limit = 100, offset = 0, userID) {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  if (status) params.append("status", status);
  return adminFetch(`/v1/admin/emails/scheduled?${params.toString()}`);
}
async function cancelScheduledEmail(id) {
  return adminFetch(`/v1/admin/emails/scheduled/${id}`, {
    method: "DELETE"
  });
}
async function triggerEmail(routingKey, event) {
  return adminFetch(`/v1/admin/emails/trigger`, {
    method: "POST",
    body: JSON.stringify({ routing_key: routingKey, event })
  });
}
async function bulkSendPreview(withinDays) {
  const params = new URLSearchParams();
  if (withinDays > 0) params.append("within_days", withinDays.toString());
  return adminFetch(
    `/v1/admin/emails/bulk-send/preview?${params.toString()}`
  );
}
async function bulkSend(emailType, withinDays) {
  return adminFetch(
    `/v1/admin/emails/bulk-send`,
    {
      method: "POST",
      body: JSON.stringify({ email_type: emailType, within_days: withinDays })
    }
  );
}
async function listPayments(limit = 50, offset = 0, search = "", statusFilter = "paid") {
  const token = await getToken();
  const params = new URLSearchParams({
    type: "payments",
    limit: limit.toString(),
    offset: offset.toString(),
    status_filter: statusFilter
  });
  if (search) params.append("search", search);
  const res = await fetch(`/api/outreach?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
function useAdminGuard() {
  const navigate = useNavigate();
  const [isAuthorized, setIsAuthorized] = useState(null);
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
            Authorization: `Bearer ${token}`
          }
        });
        if (response.ok) {
          checkedRef.current = true;
          setIsAuthorized(true);
        } else {
          checkedRef.current = true;
          navigate("/login?error=not_admin", { replace: true });
        }
      } catch (error) {
        console.error("Admin check failed:", error);
        checkedRef.current = true;
        setIsAuthorized(false);
      }
    };
    checkAuth();
  }, [session, isPending]);
  return { isAuthorized, isPending };
}
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);
const PERIODS = [{
  key: "allTime",
  label: "Lifetime"
}, {
  key: "today",
  label: "Today"
}, {
  key: "yesterday",
  label: "Yesterday"
}, {
  key: "last7",
  label: "7 days"
}, {
  key: "last30",
  label: "30 days"
}, {
  key: "custom",
  label: "Custom"
}];
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
async function phQuery$5(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query
      }
    })
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
const dashboard = UNSAFE_withComponentProps(function Dashboard() {
  const {
    isAuthorized
  } = useAdminGuard();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState("allTime");
  const todayIso = new Date(Date.now() + 5.5 * 3600 * 1e3).toISOString().slice(0, 10);
  const [cStart, setCStart] = useState(todayIso);
  const [cEnd, setCEnd] = useState(todayIso);
  const [visits, setVisits] = useState(null);
  const istShift = (days) => new Date(Date.now() + 5.5 * 3600 * 1e3 - days * 864e5).toISOString().slice(0, 10);
  const rangeFor = (pk) => {
    switch (pk) {
      case "today":
        return {
          start: todayIso,
          end: todayIso
        };
      case "yesterday": {
        const y = istShift(1);
        return {
          start: y,
          end: y
        };
      }
      case "last7":
        return {
          start: istShift(6),
          end: todayIso
        };
      case "last30":
        return {
          start: istShift(29),
          end: todayIso
        };
      case "custom":
        return cStart && cEnd ? {
          start: cStart,
          end: cEnd
        } : {};
      default:
        return {};
    }
  };
  const {
    start: srcStart,
    end: srcEnd
  } = rangeFor(period);
  useEffect(() => {
    if (!isAuthorized) return;
    const IST = "toDate(timestamp + INTERVAL 330 MINUTE)";
    const tw = srcStart && srcEnd ? `AND ${IST} >= toDate('${srcStart}') AND ${IST} <= toDate('${srcEnd}')` : "";
    setVisits(null);
    phQuery$5(`SELECT uniq(person_id) FROM events WHERE event='$pageview' ${tw}`).then((res) => setVisits(+res.results?.[0]?.[0] || 0)).catch(() => setVisits(null));
  }, [isAuthorized, period, srcStart, srcEnd]);
  const load = async (start, end) => {
    const qs = start && end ? `?start=${start}&end=${end}` : "";
    const token = await getToken();
    fetch(`/api/overview${qs}`, {
      credentials: "include",
      headers: token ? {
        Authorization: `Bearer ${token}`
      } : {}
    }).then((r) => r.json()).then((d) => d.error ? setErr(d.error) : (setData(d), setErr(""))).catch((e) => setErr(e.message));
  };
  useEffect(() => {
    if (!isAuthorized) return;
    load();
  }, [isAuthorized]);
  const applyCustom = () => {
    if (cStart && cEnd && cStart <= cEnd) load(cStart, cEnd);
  };
  const p = period === "custom" ? data?.periods?.custom : data?.periods[period];
  const trend = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.daily.map((d) => d.day.slice(5)),
      datasets: [{
        label: "Revenue (₹)",
        data: data.daily.map((d) => d.revenue),
        yAxisID: "y",
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124,58,237,0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 0
      }, {
        label: "Signups",
        data: data.daily.map((d) => d.signups),
        yAxisID: "y1",
        borderColor: "#10b981",
        backgroundColor: "transparent",
        borderDash: [5, 4],
        tension: 0.35,
        pointRadius: 0
      }]
    };
  }, [data]);
  if (!isAuthorized) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("div", {
      className: "mx-auto max-w-7xl px-4 py-8 md:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex flex-col gap-4 md:flex-row md:items-end md:justify-between",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl",
            children: "Overview"
          }), /* @__PURE__ */ jsxs("p", {
            className: "mt-1 text-sm text-neutral-500",
            children: ["Revenue and signups, IST · matches the MSL dashboard", data ? ` · FX ₹${data.fxRate}/$` : ""]
          })]
        }), /* @__PURE__ */ jsx("div", {
          className: "inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]",
          children: PERIODS.map((pp) => /* @__PURE__ */ jsx("button", {
            onClick: () => setPeriod(pp.key),
            className: `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${period === pp.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`,
            children: pp.label
          }, pp.key))
        })]
      }), period === "custom" && /* @__PURE__ */ jsxs("div", {
        className: "mt-4 flex flex-wrap items-end gap-3 rounded-xl border-2 border-neutral-900 bg-white p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            className: "block text-xs font-semibold text-neutral-500",
            children: "From"
          }), /* @__PURE__ */ jsx("input", {
            type: "date",
            value: cStart,
            max: cEnd,
            onChange: (e) => setCStart(e.target.value),
            className: "mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("label", {
            className: "block text-xs font-semibold text-neutral-500",
            children: "To"
          }), /* @__PURE__ */ jsx("input", {
            type: "date",
            value: cEnd,
            min: cStart,
            max: todayIso,
            onChange: (e) => setCEnd(e.target.value),
            className: "mt-1 rounded-lg border-2 border-neutral-300 px-3 py-1.5 text-sm"
          })]
        }), /* @__PURE__ */ jsx("button", {
          onClick: applyCustom,
          className: "rounded-lg border-2 border-neutral-900 bg-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
          children: "Apply"
        }), p && p.start && /* @__PURE__ */ jsxs("span", {
          className: "text-xs text-neutral-500",
          children: [p.start, " → ", p.end]
        })]
      }), err && /* @__PURE__ */ jsx("div", {
        className: "mt-6 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700",
        children: err
      }), !data && !err && /* @__PURE__ */ jsx("div", {
        className: "mt-10 text-center text-neutral-400",
        children: "Loading…"
      }), period === "custom" && !p && !err && /* @__PURE__ */ jsx("div", {
        className: "mt-6 text-sm text-neutral-500",
        children: "Pick a date range and hit Apply."
      }), p && /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsxs("div", {
          className: "mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-purple-500 p-6 text-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("div", {
              className: "text-xs font-bold uppercase tracking-wide opacity-80",
              children: "Revenue"
            }), /* @__PURE__ */ jsx("div", {
              className: "mt-1 font-['Clash_Display'] text-3xl font-semibold md:text-4xl",
              children: inr(p.rev.revenue)
            }), /* @__PURE__ */ jsxs("div", {
              className: "mt-2 space-y-0.5 text-[11px] leading-tight opacity-90",
              children: [/* @__PURE__ */ jsxs("div", {
                children: [inr(p.rev.inr), " INR · ", usd(p.rev.usd), " USD"]
              }), p.rev.b2b > 0 && /* @__PURE__ */ jsxs("div", {
                children: ["+ ", inr(p.rev.b2b), " B2B"]
              })]
            })]
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: p.rev.orders,
            label: "Paid Orders",
            color: "orange"
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: p.signups.toLocaleString("en-IN"),
            label: "Signups",
            color: "green"
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: p.outreach,
            label: "Outreach Orders",
            color: "pink"
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: visits === null ? "…" : visits.toLocaleString("en-IN"),
            label: period === "allTime" ? "Lifetime Visits" : "Visits",
            color: "yellow"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "mt-6 rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("h2", {
            className: "mb-4 font-['Clash_Display'] text-xl font-medium text-neutral-950",
            children: "Last 30 days"
          }), trend && /* @__PURE__ */ jsx("div", {
            className: "h-72",
            children: /* @__PURE__ */ jsx(Line, {
              data: trend,
              options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: "index",
                  intersect: false
                },
                plugins: {
                  legend: {
                    position: "top"
                  }
                },
                scales: {
                  y: {
                    position: "left",
                    title: {
                      display: true,
                      text: "Revenue (₹)"
                    },
                    beginAtZero: true
                  },
                  y1: {
                    position: "right",
                    title: {
                      display: true,
                      text: "Signups"
                    },
                    beginAtZero: true,
                    grid: {
                      drawOnChartArea: false
                    }
                  }
                }
              }
            })
          })]
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-6",
          children: /* @__PURE__ */ jsx(SourceBreakdown, {
            start: srcStart,
            end: srcEnd
          })
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4",
          children: [{
            to: "/funnel",
            label: "Funnel"
          }, {
            to: "/analytics",
            label: "Analytics"
          }, {
            to: "/outreach-orders",
            label: "Outreach Orders"
          }, {
            to: "/paid-users",
            label: "Paid Users"
          }].map((l) => /* @__PURE__ */ jsxs(Link, {
            to: l.to,
            className: "rounded-xl border-2 border-neutral-900 bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-900 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:-translate-y-0.5",
            children: [l.label, " →"]
          }, l.to))
        })]
      })]
    })]
  });
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: dashboard
}, Symbol.toStringTag, { value: "Module" }));
function meta$k({}) {
  return [{
    title: "Admin Login – Studojo"
  }, {
    name: "description",
    content: "Admin panel login"
  }];
}
const login = UNSAFE_withComponentProps(function AdminLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const {
    data: session,
    isPending
  } = authClient.useSession();
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      const tokenMatch = hash.match(/token=([^&]+)/);
      if (tokenMatch) {
        const token = decodeURIComponent(tokenMatch[1]);
        sessionStorage.setItem("admin_token", token);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        checkAdminAndRedirect();
      }
    }
  }, []);
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam === "not_admin") {
      setError("You do not have admin access. Please contact an administrator.");
    }
  }, [searchParams]);
  useEffect(() => {
    if (!isPending && session) {
      checkAdminAndRedirect();
    }
  }, [isPending, session]);
  const checkAdminAndRedirect = async () => {
    if (!session?.user) return;
    try {
      const {
        data: tokenData
      } = await authClient.token();
      if (!tokenData?.token) {
        setError("Failed to get authentication token");
        return;
      }
      const controlPlaneUrl = getControlPlaneUrl();
      const response = await fetch(`${controlPlaneUrl}/v1/admin/users?limit=1`, {
        headers: {
          Authorization: `Bearer ${tokenData.token}`
        }
      });
      if (response.ok) {
        const redirectTo = searchParams.get("redirect") || "/";
        navigate(redirectTo, {
          replace: true
        });
      } else {
        setError("You do not have admin access. Please contact an administrator.");
      }
    } catch (err) {
      setError(err.message || "Failed to verify admin access");
    }
  };
  useEffect(() => {
    if (!isPending && session) {
      checkAdminAndRedirect();
    }
  }, [isPending, session]);
  const handleGoogleSignIn = () => {
    setError(null);
    const callbackURL = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
    authClient.signIn.social({
      provider: "google",
      callbackURL
    });
  };
  if (!isPending && session) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Verifying admin access..."
        })]
      })
    });
  }
  return /* @__PURE__ */ jsx("div", {
    className: "flex min-h-screen items-center justify-center bg-gray-50 px-4",
    children: /* @__PURE__ */ jsxs("div", {
      className: "w-full max-w-md",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-8 text-center",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950",
          children: "Studojo Admin"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-2 font-['Satoshi'] text-sm font-normal leading-6 text-gray-600",
          children: "Sign in to access the admin panel"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "rounded-2xl bg-white p-8 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] outline outline-2 outline-offset-[-2px] outline-black",
        children: [error && /* @__PURE__ */ jsx("div", {
          className: "mb-6 rounded-lg bg-red-50 border-2 border-red-200 p-3",
          children: /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm font-medium text-red-900",
            children: error
          })
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex flex-col gap-4",
          children: [/* @__PURE__ */ jsxs("button", {
            type: "button",
            onClick: handleGoogleSignIn,
            className: "flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-neutral-900 bg-white font-['Satoshi'] text-sm font-medium leading-5 text-neutral-950 transition-transform hover:translate-x-[2px] hover:translate-y-[2px]",
            children: [/* @__PURE__ */ jsxs("svg", {
              className: "h-5 w-5",
              viewBox: "0 0 24 24",
              children: [/* @__PURE__ */ jsx("path", {
                fill: "currentColor",
                d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              }), /* @__PURE__ */ jsx("path", {
                fill: "currentColor",
                d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              }), /* @__PURE__ */ jsx("path", {
                fill: "currentColor",
                d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              }), /* @__PURE__ */ jsx("path", {
                fill: "currentColor",
                d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              })]
            }), "Continue with Google"]
          }), /* @__PURE__ */ jsxs("div", {
            className: "relative",
            children: [/* @__PURE__ */ jsx("div", {
              className: "absolute inset-0 flex items-center",
              children: /* @__PURE__ */ jsx("div", {
                className: "w-full border-t border-gray-200"
              })
            }), /* @__PURE__ */ jsx("div", {
              className: "relative flex justify-center text-sm",
              children: /* @__PURE__ */ jsx("span", {
                className: "bg-white px-2 font-['Satoshi'] text-gray-500",
                children: "Or"
              })
            })]
          }), /* @__PURE__ */ jsx("button", {
            type: "button",
            onClick: () => {
              let frontendUrl = "http://localhost:3000";
              if (typeof window !== "undefined") {
                const host = window.location.hostname;
                const port = window.location.port;
                const protocol = window.location.protocol;
                if (port === "3001" || window.location.port === "3001") {
                  frontendUrl = `http://${host}:3000`;
                } else if (host.startsWith("admin.")) {
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
            },
            className: "flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-violet-500 bg-violet-50 font-['Satoshi'] text-sm font-medium leading-5 text-violet-700 transition-transform hover:translate-x-[2px] hover:translate-y-[2px]",
            children: "Use credentials from main app"
          })]
        })]
      })]
    })
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: login,
  meta: meta$k
}, Symbol.toStringTag, { value: "Module" }));
function meta$j({}) {
  return [{
    title: "Users – Admin Panel"
  }, {
    name: "description",
    content: "Manage users"
  }];
}
const users = UNSAFE_withComponentProps(function Users() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [users2, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const limit = 50;
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const usersList = await listUsers(limit, offset, search || void 0);
      setUsers(Array.isArray(usersList) ? usersList : []);
    } catch (error) {
      toast$1.error(error.message || "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [offset, search]);
  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
    }
  }, [isAuthorized, loadUsers]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) {
    return null;
  }
  const handleViewDetails = async (userId) => {
    try {
      const user = await getUser(userId);
      setSelectedUser(user);
      setIsModalOpen(true);
    } catch (error) {
      toast$1.error(error.message || "Failed to load user details");
    }
  };
  const handleBanUser = async (userId, banned) => {
    try {
      await updateUser$1(userId, {
        banned
      });
      toast$1.success(banned ? "User banned" : "User unbanned");
      loadUsers();
      if (selectedUser?.id === userId) {
        const updatedUser = await getUser(userId);
        setSelectedUser(updatedUser);
      }
    } catch (error) {
      toast$1.error(error.message || "Failed to update user");
    }
  };
  const handleUpdateRole = async (userId, role) => {
    try {
      await updateUser$1(userId, {
        role: role || null
      });
      toast$1.success("User role updated");
      loadUsers();
      if (selectedUser?.id === userId) {
        const updatedUser = await getUser(userId);
        setSelectedUser(updatedUser);
      }
    } catch (error) {
      toast$1.error(error.message || "Failed to update user");
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5
        },
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
          children: "Users"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-2 font-['Satoshi'] text-base font-normal leading-6 text-gray-600",
          children: "Search and manage user accounts"
        })]
      }), /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 10
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.3,
          delay: 0.1
        },
        className: "mt-8",
        children: /* @__PURE__ */ jsx(SearchInput, {
          value: search,
          onChange: (value) => {
            setSearch(value);
            setOffset(0);
          },
          placeholder: "Search by name, email, phone, college, or course..."
        })
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "mt-8 flex items-center justify-center py-20",
        children: /* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("div", {
            className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-gray-600",
            children: "Loading users..."
          })]
        })
      }) : /* @__PURE__ */ jsx("div", {
        className: "mt-8",
        children: users2 && users2.length > 0 ? /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "border-b-2 border-neutral-900 bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Name"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Email"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Phone"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "College"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Role"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Status"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Actions"
                  })]
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: /* @__PURE__ */ jsx(AnimatePresence, {
                  mode: "popLayout",
                  children: users2.map((user, index) => /* @__PURE__ */ jsxs(motion.tr, {
                    initial: {
                      opacity: 0,
                      y: 10
                    },
                    animate: {
                      opacity: 1,
                      y: 0
                    },
                    exit: {
                      opacity: 0,
                      y: -10
                    },
                    transition: {
                      duration: 0.2,
                      delay: index * 0.02
                    },
                    className: "border-b border-neutral-200 transition-colors hover:bg-neutral-50",
                    children: [/* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm font-medium text-neutral-950",
                      children: user.name || "—"
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm text-neutral-700",
                      children: user.email || "—"
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm text-neutral-700",
                      children: user.phone_number || "—"
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm text-neutral-700",
                      children: user.college || "—"
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4",
                      children: /* @__PURE__ */ jsxs("select", {
                        value: user.role || "",
                        onChange: (e) => handleUpdateRole(user.id, e.target.value),
                        className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium transition-colors hover:bg-neutral-50 focus:outline-none",
                        children: [/* @__PURE__ */ jsx("option", {
                          value: "",
                          children: "User"
                        }), /* @__PURE__ */ jsx("option", {
                          value: "ops",
                          children: "Ops"
                        }), /* @__PURE__ */ jsx("option", {
                          value: "admin",
                          children: "Admin"
                        }), /* @__PURE__ */ jsx("option", {
                          value: "dev",
                          children: "Dev"
                        })]
                      })
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4",
                      children: user.banned ? /* @__PURE__ */ jsx("span", {
                        className: "inline-block rounded-lg bg-red-100 px-3 py-1 font-['Satoshi'] text-xs font-medium text-red-700",
                        children: "Banned"
                      }) : /* @__PURE__ */ jsx("span", {
                        className: "inline-block rounded-lg bg-green-100 px-3 py-1 font-['Satoshi'] text-xs font-medium text-green-700",
                        children: "Active"
                      })
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4",
                      children: /* @__PURE__ */ jsxs("div", {
                        className: "flex gap-2",
                        children: [/* @__PURE__ */ jsx("button", {
                          onClick: () => handleViewDetails(user.id),
                          className: "rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
                          children: "View"
                        }), /* @__PURE__ */ jsx("button", {
                          onClick: () => handleBanUser(user.id, !user.banned),
                          className: `rounded-lg border-2 border-neutral-900 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${user.banned ? "bg-green-500" : "bg-red-500"}`,
                          children: user.banned ? "Unban" : "Ban"
                        })]
                      })
                    })]
                  }, user.id))
                })
              })]
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "mt-6 flex items-center justify-between",
            children: [/* @__PURE__ */ jsxs("p", {
              className: "font-['Satoshi'] text-sm text-neutral-600",
              children: ["Showing ", users2.length, " ", users2.length === 1 ? "user" : "users", search && ` matching "${search}"`]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex gap-4",
              children: [/* @__PURE__ */ jsx("button", {
                onClick: () => setOffset(Math.max(0, offset - limit)),
                disabled: offset === 0,
                className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0",
                children: "Previous"
              }), /* @__PURE__ */ jsx("button", {
                onClick: () => setOffset(offset + limit),
                disabled: users2.length < limit,
                className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0",
                children: "Next"
              })]
            })]
          })]
        }) : /* @__PURE__ */ jsx(motion.div, {
          initial: {
            opacity: 0
          },
          animate: {
            opacity: 1
          },
          className: "mt-8 rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-base text-neutral-600",
            children: search ? `No users found matching "${search}"` : "No users found"
          })
        })
      }), /* @__PURE__ */ jsx(UserDetailModal, {
        user: selectedUser,
        isOpen: isModalOpen,
        onClose: () => {
          setIsModalOpen(false);
          setSelectedUser(null);
        },
        onUpdate: loadUsers
      })]
    })]
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: users,
  meta: meta$j
}, Symbol.toStringTag, { value: "Module" }));
async function phQuery$4(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query
      }
    })
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}
const fmt$3 = (n) => (n ?? 0).toLocaleString("en-US");
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
const niceDay$1 = (d) => (/* @__PURE__ */ new Date(d + "T00:00:00Z")).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});
const STEPS$1 = [{
  key: "visits",
  label: "Website visits"
}, {
  key: "signups",
  label: "Signed up"
}, {
  key: "outreach",
  label: "Reached outreach"
}, {
  key: "resume",
  label: "Uploaded resume"
}, {
  key: "quiz",
  label: "Completed profile quiz"
}, {
  key: "leads",
  label: "Saw their leads"
}, {
  key: "paypage",
  label: "Reached payment page"
}, {
  key: "paytap",
  label: "Tapped pay"
}, {
  key: "abandoned",
  label: "Abandoned checkout"
}, {
  key: "paid",
  label: "Paid"
}];
function envWhere$1(env) {
  if (env === "prod") return "AND properties.$host LIKE '%studojo.com%'";
  if (env === "staging") return "AND properties.$host LIKE '%studojo.pro%'";
  return "";
}
const IST_DAY = "toDate(timestamp + INTERVAL 330 MINUTE)";
function timeClause(start, end) {
  return `${IST_DAY} >= toDate('${start}') AND ${IST_DAY} <= toDate('${end}')`;
}
function macroHogql(tc, env) {
  return `
    SELECT ${IST_DAY} AS day,
      uniqIf(person_id, event='$pageview') AS visits,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS outreach,
      uniqIf(person_id, event='resume_uploaded') AS resume,
      uniqIf(person_id, event='quiz_question_answered' AND toInt(properties.question_number) >= 13) AS quiz,
      uniqIf(person_id, event='leads_loaded') AS leads,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach/enrichment%') AS paypage,
      uniqIf(person_id, event='pay_now_clicked') AS paytap,
      uniqIf(person_id, event='checkout_abandoned') AS abandoned
    FROM events WHERE ${tc} ${envWhere$1(env)}
    GROUP BY day ORDER BY day DESC`;
}
function nestedHogql(tc, env) {
  return `
    SELECT
      countIf(v) AS visited,
      countIf(v AND ro) AS reached,
      countIf(v AND ro AND ru) AS resume,
      countIf(v AND ro AND ru AND qz) AS quiz,
      countIf(v AND ro AND ru AND qz AND ld) AS leads,
      countIf(v AND ro AND ru AND qz AND ld AND pp) AS paypage,
      countIf(v AND ro AND ru AND qz AND ld AND pp AND pt) AS paytap
    FROM (
      SELECT person_id,
        max(event='$pageview') AS v,
        max(event='$pageview' AND properties.$pathname LIKE '/outreach%') AS ro,
        max(event='resume_uploaded') AS ru,
        max(event='quiz_question_answered' AND toInt(properties.question_number) >= 13) AS qz,
        max(event='leads_loaded') AS ld,
        max(event='$pageview' AND properties.$pathname LIKE '/outreach/enrichment%') AS pp,
        max(event='pay_now_clicked') AS pt
      FROM events WHERE ${tc} ${envWhere$1(env)}
      GROUP BY person_id
    )`;
}
function forkHogql(tc, env) {
  return `
    SELECT
      count() AS cohort,
      countIf(careers OR coach OR assignment OR internships OR humanizer) AS any_other,
      countIf(careers) AS careers,
      countIf(coach) AS coach,
      countIf(assignment) AS assignment,
      countIf(internships) AS internships,
      countIf(humanizer) AS humanizer
    FROM (
      SELECT person_id,
        max(event='$pageview' AND properties.$pathname LIKE '/outreach%') AS ro,
        max(event='resume_uploaded') AS ru,
        max(event='$pageview' AND properties.$pathname LIKE '/careers%') AS careers,
        max(event='$pageview' AND properties.$pathname LIKE '/cc%') AS coach,
        max(event='$pageview' AND (properties.$pathname LIKE '/assignments%' OR properties.$pathname LIKE '/dojos/assignment%')) AS assignment,
        max(event='$pageview' AND properties.$pathname LIKE '/dojos/internships%') AS internships,
        max(event='$pageview' AND properties.$pathname LIKE '/dojos/humanizer%') AS humanizer
      FROM events WHERE ${tc} ${envWhere$1(env)}
      GROUP BY person_id
    )
    WHERE ro AND NOT ru`;
}
function quizHogql(tc, env) {
  return `
    SELECT toInt(properties.question_number) AS q, uniq(person_id) AS people
    FROM events WHERE event='quiz_question_answered' AND ${tc} ${envWhere$1(env)}
      AND isNotNull(properties.question_number)
    GROUP BY q ORDER BY q ASC LIMIT 20`;
}
const DETAIL_EVENTS = ["resume_upload_started", "resume_uploaded", "resume_upload_failed", "quiz_started", "profile_quiz_completed", "discovery_started", "discovery_completed", "discovery_failed", "lead_contact_clicked", "get_emails_clicked", "tier_selected", "pay_now_clicked", "coupon_applied", "checkout_opened", "checkout_abandoned", "payment_failed", "payment_confirmed", "back_to_leads_clicked"];
function detailHogql(tc, env) {
  const list = DETAIL_EVENTS.map((e) => `'${e}'`).join(",");
  return `
    SELECT event, uniq(person_id) AS people, count() AS total
    FROM events WHERE event IN (${list}) AND ${tc} ${envWhere$1(env)}
    GROUP BY event ORDER BY people DESC`;
}
const TIMINGS = [{
  key: "quiz",
  label: "Quiz: start → complete",
  a: "quiz_started",
  b: "profile_quiz_completed"
}, {
  key: "leads",
  label: "Resume → saw leads",
  a: "resume_uploaded",
  b: "leads_loaded"
}, {
  key: "pay",
  label: "Tapped pay → paid",
  a: "pay_now_clicked",
  b: "payment_confirmed"
}, {
  key: "visitpay",
  label: "First visit → paid",
  a: "$pageview",
  b: "payment_confirmed"
}];
function timingHogql(tc, env) {
  const cols = TIMINGS.map((t) => `medianIf(dateDiff('second', t_${t.key}_a, t_${t.key}_b), t_${t.key}_a > toDateTime('2000-01-01') AND t_${t.key}_b > t_${t.key}_a) AS ${t.key}`).join(",\n      ");
  const inner = TIMINGS.map((t) => `minIf(timestamp, event='${t.a}') AS t_${t.key}_a, minIf(timestamp, event='${t.b}') AS t_${t.key}_b`).join(",\n        ");
  return `
    SELECT ${cols}
    FROM (
      SELECT person_id,
        ${inner}
      FROM events WHERE ${tc} ${envWhere$1(env)}
      GROUP BY person_id
    )`;
}
const DIMS = {
  device: {
    label: "Device",
    expr: "properties.$device_type"
  },
  country: {
    label: "Country",
    expr: "properties.$geoip_country_name"
  },
  source: {
    label: "Traffic source",
    expr: "coalesce(nullIf(properties.utm_source, ''), properties.$referring_domain, '(direct)')"
  }
};
function breakdownHogql(tc, dim, env) {
  return `
    SELECT ${DIMS[dim].expr} AS seg,
      uniqIf(person_id, event='$pageview') AS visits,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS outreach,
      uniqIf(person_id, event='resume_uploaded') AS resume,
      uniqIf(person_id, event='leads_loaded') AS leads,
      uniqIf(person_id, event='payment_confirmed') AS paid
    FROM events WHERE ${tc} ${envWhere$1(env)}
    GROUP BY seg ORDER BY visits DESC LIMIT 12`;
}
function checkoutHogql(tc, env) {
  return `
    SELECT
      uniqIf(person_id, event='pay_now_clicked') AS clicked,
      uniqIf(person_id, event='checkout_opened') AS opened,
      uniqIf(person_id, event='payment_confirmed') AS paid,
      uniqIf(person_id, event='checkout_abandoned') AS abandoned,
      uniqIf(person_id, event='payment_failed') AS failed
    FROM events WHERE ${tc} ${envWhere$1(env)}`;
}
const fmtDur = (s) => {
  if (!s || s < 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round(s % 3600 / 60)}m`;
};
const istDate = (offsetDays = 0) => new Date(Date.now() + 330 * 6e4 - offsetDays * 864e5).toISOString().slice(0, 10);
const RANGES = [{
  key: "today",
  label: "Today",
  range: () => ({
    start: istDate(0),
    end: istDate(0)
  })
}, {
  key: "yesterday",
  label: "Yesterday",
  range: () => ({
    start: istDate(1),
    end: istDate(1)
  })
}, {
  key: "7d",
  label: "7d",
  range: () => ({
    start: istDate(6),
    end: istDate(0)
  })
}, {
  key: "14d",
  label: "14d",
  range: () => ({
    start: istDate(13),
    end: istDate(0)
  })
}, {
  key: "30d",
  label: "30d",
  range: () => ({
    start: istDate(29),
    end: istDate(0)
  })
}];
const ENVS$1 = [{
  key: "all",
  label: "All"
}, {
  key: "prod",
  label: "studojo.com"
}, {
  key: "staging",
  label: "studojo.pro"
}];
const funnel = UNSAFE_withComponentProps(function FunnelPage() {
  const [rangeKey, setRangeKey] = useState("7d");
  const [rows, setRows] = useState([]);
  const [funnel2, setFunnel] = useState({
    visited: 0,
    reached: 0,
    resume: 0,
    quiz: 0,
    leads: 0
  });
  const [dbTotals, setDbTotals] = useState({
    signups: 0,
    paid: 0
  });
  const [quiz, setQuiz] = useState([]);
  const [fork, setFork] = useState(null);
  const [checkout, setCheckout] = useState({});
  const [detail, setDetail] = useState([]);
  const [timing, setTiming] = useState({});
  const [env, setEnv] = useState("all");
  const [dim, setDim] = useState("none");
  const [bdRows, setBdRows] = useState([]);
  const [bdLoading, setBdLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (rk, e) => {
    setLoading(true);
    setError("");
    try {
      const {
        start,
        end
      } = (RANGES.find((r) => r.key === rk) ?? RANGES[2]).range();
      const tc = timeClause(start, end);
      const token = await getToken();
      const [macro, nestedRes, quizRes, coRes, detailRes, timingRes, forkRes, signupsRes] = await Promise.all([phQuery$4(macroHogql(tc, e)), phQuery$4(nestedHogql(tc, e)), phQuery$4(quizHogql(tc, e)), phQuery$4(checkoutHogql(tc, e)), phQuery$4(detailHogql(tc, e)), phQuery$4(timingHogql(tc, e)), phQuery$4(forkHogql(tc, e)).catch(() => ({
        results: []
      })), fetch(`/api/dashboard?start=${start}&end=${end}`, {
        credentials: "include",
        headers: token ? {
          Authorization: `Bearer ${token}`
        } : {}
      }).then((r) => r.json()).catch(() => ({
        daily: []
      }))]);
      const fk = forkRes.results?.[0] ?? [];
      setFork(fk.length ? {
        cohort: +fk[0] || 0,
        any_other: +fk[1] || 0,
        careers: +fk[2] || 0,
        coach: +fk[3] || 0,
        assignment: +fk[4] || 0,
        internships: +fk[5] || 0,
        humanizer: +fk[6] || 0
      } : null);
      const signupMap = {};
      const paidMap = {};
      let signupTot = 0;
      let paidTot = 0;
      for (const row of signupsRes?.daily ?? []) {
        signupMap[row.day] = row.signups ?? 0;
        paidMap[row.day] = row.paid ?? 0;
        signupTot += row.signups ?? 0;
        paidTot += row.paid ?? 0;
      }
      setDbTotals({
        signups: signupTot,
        paid: paidTot
      });
      const nr = nestedRes.results?.[0] ?? [];
      setFunnel({
        visited: +nr[0] || 0,
        reached: +nr[1] || 0,
        resume: +nr[2] || 0,
        quiz: +nr[3] || 0,
        leads: +nr[4] || 0,
        paypage: +nr[5] || 0,
        paytap: +nr[6] || 0
      });
      const macroRows = (macro.results ?? []).map((r) => {
        const day = String(r[0]).slice(0, 10);
        return {
          day,
          visits: +r[1] || 0,
          outreach: +r[2] || 0,
          resume: +r[3] || 0,
          quiz: +r[4] || 0,
          leads: +r[5] || 0,
          paypage: +r[6] || 0,
          paytap: +r[7] || 0,
          abandoned: +r[8] || 0,
          paid: paidMap[day] || 0,
          signups: signupMap[day] || 0
        };
      });
      setRows(macroRows);
      setQuiz((quizRes.results ?? []).map((r) => ({
        q: +r[0],
        people: +r[1] || 0
      })));
      const co = coRes.results?.[0] ?? [];
      setCheckout({
        clicked: +co[0] || 0,
        opened: +co[1] || 0,
        paid: +co[2] || 0,
        abandoned: +co[3] || 0,
        failed: +co[4] || 0
      });
      setDetail((detailRes.results ?? []).map((r) => ({
        event: String(r[0]),
        people: +r[1] || 0,
        total: +r[2] || 0
      })));
      const tr = timingRes.results?.[0] ?? [];
      const tObj = {};
      TIMINGS.forEach((t, i) => {
        tObj[t.key] = +tr[i] || 0;
      });
      setTiming(tObj);
    } catch (e2) {
      setError(e2?.message || "Failed to load funnel");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(rangeKey, env);
  }, [rangeKey, env, load]);
  useEffect(() => {
    if (dim === "none") {
      setBdRows([]);
      return;
    }
    let cancelled = false;
    setBdLoading(true);
    const {
      start,
      end
    } = (RANGES.find((r) => r.key === rangeKey) ?? RANGES[2]).range();
    phQuery$4(breakdownHogql(timeClause(start, end), dim, env)).then((res) => {
      if (!cancelled) setBdRows(res.results ?? []);
    }).catch(() => {
      if (!cancelled) setBdRows([]);
    }).finally(() => {
      if (!cancelled) setBdLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dim, rangeKey, env]);
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label ?? rangeKey;
  const rangeTitle = rangeKey === "today" ? "Today" : rangeKey === "yesterday" ? "Yesterday" : `Last ${rangeLabel}`;
  const srcRange = (RANGES.find((r) => r.key === rangeKey) ?? RANGES[2]).range();
  const visited = funnel2.visited || 0;
  const FUNNEL = [{
    label: "Reached outreach page",
    short: "visits",
    val: funnel2.reached || 0,
    prev: visited,
    prevShort: "visits",
    note: "viewed /outreach"
  }, {
    label: "Signed up",
    short: "outreach",
    val: dbTotals.signups || 0,
    prev: funnel2.reached || 0,
    prevShort: "outreach",
    note: "DB"
  }, {
    label: "Uploaded resume",
    short: "signups",
    val: funnel2.resume || 0,
    prev: dbTotals.signups || 0,
    prevShort: "signups"
  }, {
    label: "Completed profile quiz",
    short: "resume",
    val: funnel2.quiz || 0,
    prev: funnel2.resume || 0,
    prevShort: "resume"
  }, {
    label: "Saw their leads",
    short: "quiz",
    val: funnel2.leads || 0,
    prev: funnel2.quiz || 0,
    prevShort: "quiz"
  }, {
    label: "Reached payment page",
    short: "leads",
    val: funnel2.paypage || 0,
    prev: funnel2.leads || 0,
    prevShort: "leads"
  }, {
    label: "Tapped pay",
    short: "pay page",
    val: funnel2.paytap || 0,
    prev: funnel2.paypage || 0,
    prevShort: "pay page"
  }, {
    label: "Paid",
    short: "tapped pay",
    val: dbTotals.paid || 0,
    prev: funnel2.paytap || 0,
    prevShort: "tapped pay",
    note: "DB"
  }];
  const quizMax = Math.max(1, ...quiz.map((x) => x.people));
  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Clash_Display'] text-3xl font-bold text-neutral-900",
            children: "Funnel"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-600 mt-1",
            children: "Every step from website visit to paid, plus quiz and checkout drop-off."
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex flex-wrap items-center gap-2",
          children: [/* @__PURE__ */ jsx("div", {
            className: "flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
            children: ENVS$1.map((e) => /* @__PURE__ */ jsx("button", {
              onClick: () => setEnv(e.key),
              className: `rounded-lg px-2.5 py-1 text-xs font-semibold ${env === e.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`,
              children: e.label
            }, e.key))
          }), RANGES.map((r) => /* @__PURE__ */ jsx("button", {
            onClick: () => setRangeKey(r.key),
            className: `rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${rangeKey === r.key ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`,
            children: r.label
          }, r.key))]
        })]
      }), error && /* @__PURE__ */ jsx("div", {
        className: "mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700",
        children: error
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex justify-center py-24",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent"
        })
      }) : /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsxs("div", {
          className: `mb-8 p-5 md:p-6 ${card}`,
          children: [/* @__PURE__ */ jsxs("div", {
            className: "flex items-baseline justify-between mb-4",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-xl font-bold",
              children: rangeTitle
            }), /* @__PURE__ */ jsx("span", {
              className: "text-xs text-neutral-500",
              children: "nested funnel · unique people who completed every prior step · IST"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "grid grid-cols-2 gap-4 mb-5",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4",
              children: [/* @__PURE__ */ jsx("p", {
                className: "text-[11px] font-bold uppercase tracking-wide text-neutral-500",
                children: "Website visits"
              }), /* @__PURE__ */ jsx("p", {
                className: "font-['Clash_Display'] text-3xl font-bold text-neutral-900 mt-1",
                children: fmt$3(visited)
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4",
              children: [/* @__PURE__ */ jsx("p", {
                className: "text-[11px] font-bold uppercase tracking-wide text-neutral-500",
                children: "Signed up"
              }), /* @__PURE__ */ jsxs("p", {
                className: "font-['Clash_Display'] text-3xl font-bold text-neutral-900 mt-1",
                children: [fmt$3(dbTotals.signups), " ", /* @__PURE__ */ jsxs("span", {
                  className: "text-base font-semibold text-neutral-400",
                  children: ["· ", pct(dbTotals.signups, visited), "% of visits"]
                })]
              })]
            })]
          }), /* @__PURE__ */ jsx("p", {
            className: "text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-2",
            children: "Outreach funnel"
          }), /* @__PURE__ */ jsx("div", {
            className: "space-y-3",
            children: FUNNEL.map((s, i) => {
              const ofVisits = pct(s.val, visited);
              const ofReached = pct(s.val, FUNNEL[0].val);
              const kept = Math.min(100, pct(s.val, s.prev));
              const drop = 100 - kept;
              return /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-4",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "w-44 flex-shrink-0 text-sm font-semibold",
                  children: [i + 1, ". ", s.label, s.note && /* @__PURE__ */ jsx("span", {
                    className: "block text-[10px] font-normal text-neutral-400",
                    children: s.note
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex-1 h-8 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200",
                  children: /* @__PURE__ */ jsx("div", {
                    className: `h-full flex items-center px-2 ${s.label === "Paid" ? "bg-emerald-500" : "bg-violet-500"}`,
                    style: {
                      width: `${Math.max(ofReached, 3)}%`
                    },
                    children: /* @__PURE__ */ jsx("span", {
                      className: "text-xs font-bold text-white whitespace-nowrap",
                      children: fmt$3(s.val)
                    })
                  })
                }), /* @__PURE__ */ jsxs("div", {
                  className: "w-16 text-right text-sm font-bold",
                  children: [ofVisits, "%", /* @__PURE__ */ jsx("span", {
                    className: "block text-[10px] font-normal text-neutral-400",
                    children: "of visits"
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  className: "w-36 text-right",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: `text-sm font-bold ${i === 0 ? "text-neutral-400" : drop > 60 ? "text-red-600" : drop > 30 ? "text-amber-600" : "text-emerald-600"}`,
                    children: i === 0 ? "base" : `${kept}%`
                  }), i > 0 && /* @__PURE__ */ jsxs("div", {
                    className: "text-[10px] font-normal text-neutral-400",
                    children: ["of ", s.prevShort, " · -", drop, "% drop"]
                  })]
                })]
              }, s.label);
            })
          })]
        }), /* @__PURE__ */ jsx(SourceBreakdown, {
          start: srcRange.start,
          end: srcRange.end,
          env,
          className: "mb-8"
        }), fork && fork.cohort > 0 && /* @__PURE__ */ jsxs("div", {
          className: `p-5 md:p-6 mb-8 ${card}`,
          children: [/* @__PURE__ */ jsx("h2", {
            className: "font-['Clash_Display'] text-xl font-bold mb-1",
            children: "Where the drop-offs went"
          }), /* @__PURE__ */ jsxs("p", {
            className: "text-xs text-neutral-500 mb-4",
            children: ["Of the ", /* @__PURE__ */ jsx("b", {
              children: fmt$3(fork.cohort)
            }), " people who reached outreach but never uploaded a resume,", " ", /* @__PURE__ */ jsx("b", {
              children: fmt$3(fork.any_other)
            }), " (", pct(fork.any_other, fork.cohort), "%) used another Studojo tool instead."]
          }), /* @__PURE__ */ jsx("div", {
            className: "space-y-2",
            children: [{
              label: "Career Coach (chat)",
              v: fork.coach
            }, {
              label: "Resume / Careers",
              v: fork.careers
            }, {
              label: "Assignment Dojo",
              v: fork.assignment
            }, {
              label: "Internships Dojo",
              v: fork.internships
            }, {
              label: "Humanizer",
              v: fork.humanizer
            }, {
              label: "Used no other tool (pure drop)",
              v: Math.max(0, fork.cohort - fork.any_other)
            }].map((t) => /* @__PURE__ */ jsxs("div", {
              className: "flex items-center gap-3",
              children: [/* @__PURE__ */ jsx("div", {
                className: "w-48 flex-shrink-0 text-sm font-medium",
                children: t.label
              }), /* @__PURE__ */ jsx("div", {
                className: "flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200",
                children: /* @__PURE__ */ jsx("div", {
                  className: "h-full bg-violet-400 flex items-center px-2",
                  style: {
                    width: `${Math.max(pct(t.v, fork.cohort), t.v > 0 ? 4 : 0)}%`
                  },
                  children: t.v > 0 && /* @__PURE__ */ jsx("span", {
                    className: "text-xs font-bold text-white",
                    children: fmt$3(t.v)
                  })
                })
              }), /* @__PURE__ */ jsxs("div", {
                className: "w-14 text-right text-sm font-bold",
                children: [pct(t.v, fork.cohort), "%"]
              })]
            }, t.label))
          }), /* @__PURE__ */ jsx("p", {
            className: "text-[11px] text-neutral-400 mt-3",
            children: "A person can appear under more than one tool. Cohort = reached /outreach, no resume upload (PostHog person-level)."
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "grid gap-6 lg:grid-cols-2 mb-8",
          children: [/* @__PURE__ */ jsxs("div", {
            className: `p-5 md:p-6 ${card}`,
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-xl font-bold mb-1",
              children: "Quiz drop-off"
            }), /* @__PURE__ */ jsx("p", {
              className: "text-xs text-neutral-500 mb-4",
              children: "How many people answered each question. Where the bar shrinks is where they quit."
            }), quiz.length === 0 ? /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-400 py-6 text-center",
              children: "No quiz data yet (events start after the latest deploy)."
            }) : /* @__PURE__ */ jsx("div", {
              className: "space-y-2",
              children: quiz.map((x, i) => {
                const prev = i === 0 ? x.people : quiz[i - 1].people;
                const drop = i === 0 ? 0 : 100 - pct(x.people, prev);
                return /* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-3",
                  children: [/* @__PURE__ */ jsxs("div", {
                    className: "w-14 flex-shrink-0 text-xs font-semibold text-neutral-600",
                    children: ["Q", x.q]
                  }), /* @__PURE__ */ jsx("div", {
                    className: "flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200",
                    children: /* @__PURE__ */ jsx("div", {
                      className: "h-full bg-emerald-500 flex items-center px-2",
                      style: {
                        width: `${Math.max(pct(x.people, quizMax), 4)}%`
                      },
                      children: /* @__PURE__ */ jsx("span", {
                        className: "text-[11px] font-bold text-white",
                        children: fmt$3(x.people)
                      })
                    })
                  }), /* @__PURE__ */ jsx("div", {
                    className: `w-16 text-right text-xs font-semibold ${drop > 30 ? "text-red-600" : "text-neutral-400"}`,
                    children: i === 0 ? "—" : `-${drop}%`
                  })]
                }, x.q);
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: `p-5 md:p-6 ${card}`,
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-xl font-bold mb-1",
              children: "Checkout drop-off"
            }), /* @__PURE__ */ jsx("p", {
              className: "text-xs text-neutral-500 mb-4",
              children: "Tapped pay → reached Razorpay/Dodo → paid. Plus who abandoned or failed."
            }), (checkout.clicked || 0) === 0 ? /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-400 py-6 text-center",
              children: "No checkout data yet (events start after the latest deploy)."
            }) : /* @__PURE__ */ jsxs("div", {
              className: "space-y-3",
              children: [[["Tapped pay", checkout.clicked], ["Reached checkout", checkout.opened], ["Paid", checkout.paid]].map(([label, val], i, arr) => {
                const prev = i === 0 ? val : arr[i - 1][1];
                const drop = i === 0 ? 0 : 100 - pct(val, prev);
                return /* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-3",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "w-32 flex-shrink-0 text-sm font-semibold",
                    children: label
                  }), /* @__PURE__ */ jsx("div", {
                    className: "flex-1 h-8 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200",
                    children: /* @__PURE__ */ jsx("div", {
                      className: "h-full bg-violet-500 flex items-center px-2",
                      style: {
                        width: `${Math.max(pct(val, checkout.clicked || 1), 4)}%`
                      },
                      children: /* @__PURE__ */ jsx("span", {
                        className: "text-xs font-bold text-white",
                        children: fmt$3(val)
                      })
                    })
                  }), /* @__PURE__ */ jsx("div", {
                    className: `w-16 text-right text-xs font-semibold ${drop > 40 ? "text-red-600" : "text-neutral-400"}`,
                    children: i === 0 ? "—" : `-${drop}%`
                  })]
                }, label);
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex gap-3 pt-2 mt-1 border-t border-neutral-100",
                children: [/* @__PURE__ */ jsxs("span", {
                  className: "rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700",
                  children: [fmt$3(checkout.abandoned || 0), " abandoned"]
                }), /* @__PURE__ */ jsxs("span", {
                  className: "rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700",
                  children: [fmt$3(checkout.failed || 0), " failed"]
                })]
              })]
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: `mb-8 p-5 md:p-6 ${card}`,
          children: [/* @__PURE__ */ jsx("h2", {
            className: "font-['Clash_Display'] text-xl font-bold mb-1",
            children: "Time between steps"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-xs text-neutral-500 mb-4",
            children: "Median time people take to move from one step to the next."
          }), /* @__PURE__ */ jsx("div", {
            className: "grid grid-cols-2 lg:grid-cols-4 gap-4",
            children: TIMINGS.map((t) => /* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4 text-center",
              children: [/* @__PURE__ */ jsx("p", {
                className: "font-['Clash_Display'] text-2xl font-bold text-neutral-900",
                children: fmtDur(timing[t.key] || 0)
              }), /* @__PURE__ */ jsx("p", {
                className: "text-[11px] text-neutral-600 mt-1",
                children: t.label
              })]
            }, t.key))
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: `mb-8 p-5 md:p-6 ${card}`,
          children: [/* @__PURE__ */ jsxs("div", {
            className: "flex flex-wrap items-center justify-between gap-3 mb-4",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("h2", {
                className: "font-['Clash_Display'] text-xl font-bold",
                children: "Funnel by segment"
              }), /* @__PURE__ */ jsx("p", {
                className: "text-xs text-neutral-500 mt-0.5",
                children: "Compare conversion across device, country, or traffic source."
              })]
            }), /* @__PURE__ */ jsx("div", {
              className: "flex items-center gap-2",
              children: ["none", "device", "country", "source"].map((d) => /* @__PURE__ */ jsx("button", {
                onClick: () => setDim(d),
                className: `rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${dim === d ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`,
                children: d === "none" ? "None" : DIMS[d].label
              }, d))
            })]
          }), dim === "none" ? /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-400 py-6 text-center",
            children: "Pick a dimension above to break the funnel down."
          }) : bdLoading ? /* @__PURE__ */ jsx("div", {
            className: "flex justify-center py-8",
            children: /* @__PURE__ */ jsx("div", {
              className: "h-6 w-6 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent"
            })
          }) : /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse text-sm",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "bg-neutral-50 text-left text-neutral-700",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "px-3 py-2 border-b border-neutral-200",
                    children: DIMS[dim].label
                  }), ["Visits", "Reached outreach", "Resume", "Saw leads", "Paid", "Visit→Paid"].map((h) => /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-2 text-right border-b border-neutral-200 whitespace-nowrap",
                    children: h
                  }, h))]
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: bdRows.map((r, i) => {
                  const [seg, v, o, re, le, pa] = [String(r[0] ?? "(unknown)"), +r[1] || 0, +r[2] || 0, +r[3] || 0, +r[4] || 0, +r[5] || 0];
                  return /* @__PURE__ */ jsxs("tr", {
                    className: i % 2 ? "bg-neutral-50/40" : "bg-white",
                    children: [/* @__PURE__ */ jsx("td", {
                      className: "px-3 py-2 font-medium border-b border-neutral-100 max-w-[200px] truncate",
                      children: seg
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums",
                      children: fmt$3(v)
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums",
                      children: fmt$3(o)
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums",
                      children: fmt$3(re)
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums",
                      children: fmt$3(le)
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums font-semibold",
                      children: fmt$3(pa)
                    }), /* @__PURE__ */ jsxs("td", {
                      className: `px-3 py-2 text-right border-b border-neutral-100 tabular-nums font-bold ${pct(pa, v) >= 2 ? "text-emerald-600" : "text-neutral-500"}`,
                      children: [pct(pa, v), "%"]
                    })]
                  }, i);
                })
              })]
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: `mb-8 p-5 md:p-6 ${card}`,
          children: [/* @__PURE__ */ jsx("h2", {
            className: "font-['Clash_Display'] text-xl font-bold mb-1",
            children: "All tracked events"
          }), /* @__PURE__ */ jsxs("p", {
            className: "text-xs text-neutral-500 mb-4",
            children: ["Every semantic event · ", rangeTitle.toLowerCase(), ". People = unique users, Total = raw count."]
          }), detail.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-400 py-6 text-center",
            children: "No events yet (new events start collecting after the latest deploy)."
          }) : /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse text-sm",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "bg-neutral-50 text-left text-neutral-700",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "px-3 py-2 border-b border-neutral-200",
                    children: "Event"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-2 text-right border-b border-neutral-200",
                    children: "People"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-2 text-right border-b border-neutral-200",
                    children: "Total"
                  })]
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: detail.map((e, i) => /* @__PURE__ */ jsxs("tr", {
                  className: i % 2 ? "bg-neutral-50/40" : "bg-white",
                  children: [/* @__PURE__ */ jsx("td", {
                    className: "px-3 py-2 font-mono text-[13px] border-b border-neutral-100",
                    children: e.event
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums font-semibold",
                    children: fmt$3(e.people)
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-3 py-2 text-right border-b border-neutral-100 tabular-nums text-neutral-500",
                    children: fmt$3(e.total)
                  })]
                }, e.event))
              })]
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: `overflow-hidden ${card}`,
          children: [/* @__PURE__ */ jsx("div", {
            className: "px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50",
            children: /* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-lg font-bold",
              children: "Day by day"
            })
          }), /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse text-sm",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "sticky left-0 z-10 bg-neutral-50 text-left px-4 py-3 font-semibold text-neutral-700 border-b border-neutral-200 min-w-[180px]",
                    children: "Step"
                  }), rows.map((r) => /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-3 text-right font-semibold text-neutral-700 border-b border-l border-neutral-200 whitespace-nowrap",
                    children: niceDay$1(r.day)
                  }, r.day))]
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: STEPS$1.map((s, i) => /* @__PURE__ */ jsxs("tr", {
                  className: i % 2 ? "bg-neutral-50/40" : "bg-white",
                  children: [/* @__PURE__ */ jsxs("td", {
                    className: "sticky left-0 z-10 bg-inherit px-4 py-2.5 font-medium border-b border-neutral-100 whitespace-nowrap",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: "text-neutral-400 mr-1.5",
                      children: i + 1
                    }), s.label]
                  }), rows.map((r) => {
                    const val = r[s.key] || 0;
                    const conv = i === 0 ? 100 : pct(val, r.visits || 0);
                    return /* @__PURE__ */ jsxs("td", {
                      className: "px-3 py-2.5 text-right border-b border-l border-neutral-100 tabular-nums",
                      children: [/* @__PURE__ */ jsx("span", {
                        className: "font-semibold",
                        children: fmt$3(val)
                      }), i > 0 && /* @__PURE__ */ jsxs("span", {
                        className: "block text-[10px] text-neutral-400",
                        children: [conv, "%"]
                      })]
                    }, r.day);
                  })]
                }, s.key))
              })]
            })
          })]
        }), /* @__PURE__ */ jsx("p", {
          className: "text-xs text-neutral-400 mt-4",
          children: `Signups and Paid from Postgres (authoritative). Other steps = unique people in PostHog. "Reached outreach" = a /outreach pageview. "Completed profile quiz" = answered the final question (Q13) via quiz_question_answered — the reliable signal; the old profile_quiz_completed event over-fired so it's no longer used here. Note: per-question quiz/checkout events started 17 Jun, so ranges before that show 0 for those steps.`
        })]
      })]
    })]
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: funnel
}, Symbol.toStringTag, { value: "Module" }));
async function phQuery$3(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query
      }
    })
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
async function phGet$1(type, params) {
  const qs = new URLSearchParams({
    type,
    ...params
  }).toString();
  const res = await fetch(`/api/posthog?${qs}`, {
    credentials: "include"
  });
  if (!res.ok) throw new Error(`PostHog ${type} ${res.status}`);
  return res.json();
}
const envWhere = (e) => e === "prod" ? "AND properties.$host LIKE '%studojo.com%'" : e === "staging" ? "AND properties.$host LIKE '%studojo.pro%'" : "";
const STEPS = [{
  key: "reached",
  label: "Reached outreach"
}, {
  key: "resume",
  label: "Uploaded resume"
}, {
  key: "quiz_started",
  label: "Started quiz"
}, {
  key: "quiz_done",
  label: "Completed quiz"
}, {
  key: "leads",
  label: "Saw leads"
}, {
  key: "pay_click",
  label: "Tapped pay"
}, {
  key: "checkout",
  label: "Reached checkout"
}, {
  key: "paid",
  label: "Paid"
}];
const PRODUCTS = [{
  key: "p_resume",
  label: "Resume builder",
  cls: "bg-blue-100 text-blue-700"
}, {
  key: "p_intern",
  label: "Internship Dojo",
  cls: "bg-emerald-100 text-emerald-700"
}, {
  key: "p_coach",
  label: "Career Coach",
  cls: "bg-amber-100 text-amber-700"
}, {
  key: "p_assign",
  label: "Assignment Dojo",
  cls: "bg-fuchsia-100 text-fuchsia-700"
}, {
  key: "p_human",
  label: "Humanizer",
  cls: "bg-cyan-100 text-cyan-700"
}];
function listHogql(days, env) {
  return `
    SELECT person_id,
      any(person.properties.email) AS email,
      min(timestamp) AS first_seen,
      max(timestamp) AS last_seen,
      count() AS events,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS reached,
      maxIf(1, event='resume_uploaded') AS resume,
      maxIf(1, event='quiz_started') AS quiz_started,
      maxIf(1, event='quiz_question_answered' AND toInt(properties.question_number) >= 13) AS quiz_done,
      max(if(event='quiz_question_answered', toInt(properties.question_number), 0)) AS quiz_qmax,
      maxIf(1, event='leads_loaded') AS leads,
      maxIf(1, event='pay_now_clicked') AS pay_click,
      maxIf(1, event='checkout_opened') AS checkout,
      maxIf(1, event='payment_confirmed') AS paid,
      maxIf(1, event='$pageview' AND (properties.$pathname LIKE '/careers%' OR properties.$pathname LIKE '/jrs%')) AS p_resume,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/dojos/internships%') AS p_intern,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/cc%') AS p_coach,
      maxIf(1, event='$pageview' AND (properties.$pathname LIKE '/dojos/assignment%' OR properties.$pathname LIKE '/assignments%')) AS p_assign,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/dojos/humanizer%') AS p_human,
      any(person.properties.$initial_utm_source) AS utm_source,
      any(person.properties.$initial_utm_medium) AS utm_medium,
      any(person.properties.$initial_utm_campaign) AS utm_campaign,
      any(person.properties.$initial_referring_domain) AS ref_domain,
      any(properties.$device_type) AS device,
      any(properties.$geoip_country_name) AS country
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
    GROUP BY person_id
    HAVING email != '' AND email IS NOT NULL
    ORDER BY last_seen DESC LIMIT 300`;
}
const fmtTime = (t) => new Date(t).toLocaleString("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});
const ago$1 = (t) => {
  const s = (Date.now() - new Date(t).getTime()) / 1e3;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const PRESETS$1 = [7, 14, 30];
const ENVS = [{
  k: "all",
  l: "All"
}, {
  k: "prod",
  l: "studojo.com"
}, {
  k: "staging",
  l: "studojo.pro"
}];
const MILESTONE_EVENTS = /* @__PURE__ */ new Set(["resume_uploaded", "quiz_started", "profile_quiz_completed", "quiz_question_answered", "discovery_started", "discovery_completed", "discovery_failed", "leads_loaded", "pay_now_clicked", "checkout_opened", "payment_confirmed", "resume_upload_failed", "checkout_abandoned", "payment_failed", "back_to_leads_clicked", "get_emails_clicked", "lead_contact_clicked", "signed_up"]);
function source(r) {
  const med = (r.utmMedium || "").toLowerCase();
  const src = (r.utmSource || "").toLowerCase();
  const ref = (r.refDomain || "").toLowerCase();
  const isEmail = med === "email" || src.includes("email") || src.includes("newsletter") || /mail|gmail|outlook/.test(ref);
  if (isEmail) return {
    label: r.utmCampaign ? `Email · ${r.utmCampaign}` : "Email",
    cls: "bg-violet-100 text-violet-700"
  };
  if (src) return {
    label: r.utmCampaign ? `${r.utmSource} · ${r.utmCampaign}` : r.utmSource,
    cls: "bg-sky-100 text-sky-700"
  };
  if (ref && ref !== "$direct" && ref !== "") return {
    label: ref,
    cls: "bg-neutral-100 text-neutral-600"
  };
  return {
    label: "Direct",
    cls: "bg-neutral-100 text-neutral-500"
  };
}
const userJourneys = UNSAFE_withComponentProps(function UserJourneys() {
  const [days, setDays] = useState(14);
  const [env, setEnv] = useState("all");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [timeline, setTimeline] = useState({});
  const [tlLoading, setTlLoading] = useState(false);
  const load = useCallback(async (d, e) => {
    setLoading(true);
    setError("");
    setOpen(null);
    try {
      const token = await getToken();
      const authHeaders = token ? {
        Authorization: `Bearer ${token}`
      } : {};
      const [res, paidRes, stageRes] = await Promise.all([phQuery$3(listHogql(d, e)), fetch(`/api/paid-emails`, {
        credentials: "include",
        headers: authHeaders
      }).then((r) => r.json()).catch(() => ({
        emails: []
      })), fetch(`/api/journeys`, {
        credentials: "include",
        headers: authHeaders
      }).then((r) => r.json()).catch(() => ({
        stages: {}
      }))]);
      const paidSet = new Set((paidRes.emails ?? []).map((x) => (x || "").toLowerCase()));
      const dbStages = stageRes.stages ?? {};
      const cols = res.columns ?? [];
      const idx = (n) => cols.indexOf(n);
      setRows((res.results ?? []).map((r) => {
        const email = r[idx("email")] || "";
        const lc = email.toLowerCase();
        const ph = {
          reached: +r[idx("reached")],
          resume: +r[idx("resume")],
          quiz_started: +r[idx("quiz_started")],
          quiz_done: +r[idx("quiz_done")],
          leads: +r[idx("leads")],
          pay_click: +r[idx("pay_click")],
          checkout: +r[idx("checkout")],
          paid: +r[idx("paid")]
        };
        const db2 = dbStages[lc] || {};
        const dbf = (v) => v ? 1 : 0;
        const flags = {
          reached: ph.reached,
          resume: dbf(db2.resume) || ph.resume,
          quiz_started: dbf(db2.quiz_started) || ph.quiz_started,
          quiz_done: dbf(db2.quiz_done) || ph.quiz_done,
          leads: dbf(db2.leads) || ph.leads,
          pay_click: dbf(db2.payment_page) || ph.pay_click,
          checkout: dbf(db2.payment_page) || ph.checkout,
          paid: dbf(db2.paid) || (lc && paidSet.has(lc) ? 1 : 0) || ph.paid
        };
        let seenLater = 0;
        for (let k = STEPS.length - 1; k >= 0; k--) {
          if (flags[STEPS[k].key]) seenLater = 1;
          else if (seenLater) flags[STEPS[k].key] = 1;
        }
        return {
          pid: String(r[idx("person_id")]),
          email,
          first: r[idx("first_seen")],
          last: r[idx("last_seen")],
          events: +r[idx("events")] || 0,
          qmax: +r[idx("quiz_qmax")] || 0,
          device: r[idx("device")] || "",
          country: r[idx("country")] || "",
          utmSource: r[idx("utm_source")] || "",
          utmMedium: r[idx("utm_medium")] || "",
          utmCampaign: r[idx("utm_campaign")] || "",
          refDomain: r[idx("ref_domain")] || "",
          flags,
          products: {
            p_resume: +r[idx("p_resume")],
            p_intern: +r[idx("p_intern")],
            p_coach: +r[idx("p_coach")],
            p_assign: +r[idx("p_assign")],
            p_human: +r[idx("p_human")]
          }
        };
      }));
    } catch (e2) {
      setError(e2?.message || "Failed");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(days, env);
  }, [days, env, load]);
  const openTimeline = async (pid) => {
    if (open === pid) {
      setOpen(null);
      return;
    }
    setOpen(pid);
    if (timeline[pid]) return;
    setTlLoading(true);
    try {
      const res = await phGet$1("person_events", {
        person_id: pid
      });
      const cols = res.columns ?? [];
      const events = (res.results ?? []).map((r) => {
        const o = {};
        cols.forEach((c, i) => {
          o[c.replace("properties.", "")] = r[i];
        });
        return o;
      }).reverse();
      setTimeline((t) => ({
        ...t,
        [pid]: events
      }));
    } catch {
      setTimeline((t) => ({
        ...t,
        [pid]: []
      }));
    } finally {
      setTlLoading(false);
    }
  };
  const furthest = (f) => {
    let i = -1;
    STEPS.forEach((s, k) => {
      if (f[s.key]) i = k;
    });
    return i;
  };
  const filtered = rows.filter((r) => !search || r.email.toLowerCase().includes(search.toLowerCase()) || r.pid.includes(search));
  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
  const propSummary = (e) => {
    const bits = [];
    if (e.question_number) bits.push(`Q${e.question_number}${e.answer_type ? ` (${e.answer_type})` : ""}`);
    if (e.tier) bits.push(`tier ${e.tier}`);
    if (e.provider) bits.push(e.provider);
    if (e.company) bits.push(e.company);
    if (e.coupon_code) bits.push(`coupon ${e.coupon_code}`);
    if (e.reason) bits.push(String(e.reason).slice(0, 40));
    if (e.file_type) bits.push(e.file_type);
    if (e.event === "$pageview" && e.$pathname) bits.push(e.$pathname);
    return bits.join(" · ");
  };
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[100rem] px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Clash_Display'] text-3xl font-bold text-neutral-900",
            children: "User Journeys"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-600 mt-1",
            children: "Signed-up users only — how they arrived, which tools they used, and where they dropped off."
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex flex-wrap items-center gap-2",
          children: [/* @__PURE__ */ jsx("input", {
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Search email…",
            className: "rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm focus:outline-none shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
          }), /* @__PURE__ */ jsx("div", {
            className: "flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
            children: ENVS.map((e) => /* @__PURE__ */ jsx("button", {
              onClick: () => setEnv(e.k),
              className: `rounded-lg px-2.5 py-1 text-xs font-semibold ${env === e.k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`,
              children: e.l
            }, e.k))
          }), PRESETS$1.map((p) => /* @__PURE__ */ jsxs("button", {
            onClick: () => setDays(p),
            className: `rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${days === p ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`,
            children: [p, "d"]
          }, p))]
        })]
      }), error && /* @__PURE__ */ jsx("div", {
        className: "mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700",
        children: error
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex justify-center py-24",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent"
        })
      }) : /* @__PURE__ */ jsxs("div", {
        className: `overflow-hidden ${card}`,
        children: [/* @__PURE__ */ jsxs("div", {
          className: "px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50 flex flex-wrap items-center justify-between gap-2",
          children: [/* @__PURE__ */ jsxs("h2", {
            className: "font-['Clash_Display'] text-lg font-bold",
            children: [filtered.length, " signed-up users"]
          }), /* @__PURE__ */ jsxs("div", {
            className: "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500",
            children: [/* @__PURE__ */ jsxs("span", {
              className: "inline-flex items-center gap-1",
              children: [/* @__PURE__ */ jsx("span", {
                className: "h-2.5 w-2.5 rounded-full bg-violet-500"
              }), "reached step"]
            }), /* @__PURE__ */ jsxs("span", {
              className: "inline-flex items-center gap-1",
              children: [/* @__PURE__ */ jsx("span", {
                className: "h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-red-200"
              }), "dropped here"]
            }), /* @__PURE__ */ jsxs("span", {
              className: "inline-flex items-center gap-1",
              children: [/* @__PURE__ */ jsx("span", {
                className: "h-2.5 w-2.5 rounded-full bg-neutral-200"
              }), "never reached"]
            }), /* @__PURE__ */ jsx("span", {
              className: "text-neutral-400",
              children: "· funnel from server-side DB stages · click a row for the path"
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "divide-y divide-neutral-100",
          children: [filtered.map((r) => {
            const fi = furthest(r.flags);
            const paid = r.flags.paid === 1;
            const usedProducts = PRODUCTS.filter((p) => r.products[p.key]);
            const dropLabel = paid ? "Converted" : fi >= 0 ? fi < STEPS.length - 1 ? `Dropped before: ${STEPS[fi + 1].label}` : "Reached last step" : usedProducts.length > 0 ? "Other tools only" : "Signed up only";
            const src = source(r);
            return /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsxs("button", {
                onClick: () => openTimeline(r.pid),
                className: "w-full text-left px-4 py-3 hover:bg-neutral-50 flex flex-wrap items-center gap-x-4 gap-y-2",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "min-w-0 flex-1",
                  children: [/* @__PURE__ */ jsx("p", {
                    className: "font-semibold text-sm text-neutral-900 truncate",
                    children: r.email
                  }), /* @__PURE__ */ jsxs("p", {
                    className: "text-[11px] text-neutral-500 flex flex-wrap items-center gap-x-2 gap-y-0.5",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: `inline-block rounded px-1.5 py-0.5 font-semibold ${src.cls}`,
                      children: src.label
                    }), /* @__PURE__ */ jsxs("span", {
                      children: [r.events, " events · ", r.device || "?", " · ", r.country || "?", " · last ", ago$1(r.last)]
                    })]
                  }), usedProducts.length > 0 && /* @__PURE__ */ jsx("div", {
                    className: "mt-1 flex flex-wrap gap-1",
                    children: usedProducts.map((p) => /* @__PURE__ */ jsx("span", {
                      className: `inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.cls}`,
                      children: p.label
                    }, p.key))
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  className: "w-28 text-center flex-shrink-0",
                  children: r.flags.quiz_done ? /* @__PURE__ */ jsx("span", {
                    className: "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-violet-100 text-violet-700",
                    children: "Quiz done"
                  }) : r.qmax > 0 || r.flags.quiz_started ? /* @__PURE__ */ jsxs("span", {
                    className: "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-700",
                    children: ["Quiz: Q", r.qmax || 1]
                  }) : /* @__PURE__ */ jsx("span", {
                    className: "text-[11px] text-neutral-300",
                    children: "no quiz"
                  })
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex items-center gap-1",
                  children: STEPS.map((s, k) => {
                    const done = r.flags[s.key];
                    let cls, title;
                    if (done) {
                      cls = s.key === "paid" ? "bg-emerald-500" : "bg-violet-500";
                      title = `${s.label} ✓`;
                    } else if (k === fi + 1 && !paid) {
                      cls = "bg-red-400 ring-2 ring-red-200";
                      title = `${s.label} — dropped here`;
                    } else {
                      cls = "bg-neutral-200";
                      title = `${s.label} — never reached`;
                    }
                    return /* @__PURE__ */ jsx("span", {
                      title,
                      className: `h-2.5 w-2.5 rounded-full ${cls}`
                    }, s.key);
                  })
                }), /* @__PURE__ */ jsx("div", {
                  className: "w-48 text-right",
                  children: /* @__PURE__ */ jsx("span", {
                    className: `inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-700" : fi < 0 ? "bg-neutral-100 text-neutral-500" : "bg-red-50 text-red-700"}`,
                    children: dropLabel
                  })
                })]
              }), open === r.pid && /* @__PURE__ */ jsxs("div", {
                className: "bg-neutral-50 px-5 py-4 border-t border-neutral-100",
                children: [tlLoading && !timeline[r.pid] ? /* @__PURE__ */ jsx("div", {
                  className: "flex justify-center py-4",
                  children: /* @__PURE__ */ jsx("div", {
                    className: "h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent"
                  })
                }) : (timeline[r.pid] ?? []).length === 0 ? /* @__PURE__ */ jsx("p", {
                  className: "text-sm text-neutral-400 py-2",
                  children: "No events found."
                }) : /* @__PURE__ */ jsx("ol", {
                  className: "relative border-l-2 border-neutral-200 ml-2 space-y-3",
                  children: (timeline[r.pid] ?? []).map((e, i) => /* @__PURE__ */ jsxs("li", {
                    className: "ml-4",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: `absolute -left-[7px] h-3 w-3 rounded-full ${MILESTONE_EVENTS.has(e.event) ? "bg-violet-500" : e.event === "payment_confirmed" ? "bg-emerald-500" : "bg-neutral-300"}`
                    }), /* @__PURE__ */ jsxs("div", {
                      className: "flex items-baseline gap-2 flex-wrap",
                      children: [/* @__PURE__ */ jsx("span", {
                        className: `font-mono text-[13px] ${MILESTONE_EVENTS.has(e.event) || e.event === "payment_confirmed" ? "font-bold text-neutral-900" : "text-neutral-700"}`,
                        children: e.event
                      }), /* @__PURE__ */ jsx("span", {
                        className: "text-[11px] text-neutral-400",
                        children: fmtTime(e.timestamp)
                      }), propSummary(e) && /* @__PURE__ */ jsx("span", {
                        className: "text-[11px] text-neutral-500",
                        children: propSummary(e)
                      })]
                    })]
                  }, i))
                }), /* @__PURE__ */ jsx("p", {
                  className: "text-[11px] text-neutral-400 mt-3",
                  children: "Showing up to 80 most-recent events. Open this person in PostHog for the full session replay."
                })]
              })]
            }, r.pid);
          }), filtered.length === 0 && /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-400 py-10 text-center",
            children: "No signed-up users in this window."
          })]
        })]
      })]
    })]
  });
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: userJourneys
}, Symbol.toStringTag, { value: "Module" }));
Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);
async function phQuery$2(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query
      }
    })
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
const isoDate$1 = (d) => d.toISOString().slice(0, 10);
const fmt$2 = (n) => (Math.round(n) ?? 0).toLocaleString("en-US");
const niceDay = (d) => (/* @__PURE__ */ new Date(d + "T00:00:00Z")).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});
const METRICS = [{
  key: "visitors",
  label: "Visitors"
}, {
  key: "signups",
  label: "Signups"
}, {
  key: "orders",
  label: "Outreach Orders"
}, {
  key: "emails",
  label: "Emails Sent"
}, {
  key: "replies",
  label: "Replies"
}, {
  key: "replyRate",
  label: "Reply Rate %",
  rate: true
}, {
  key: "paid",
  label: "Paid Users"
}];
const PRESETS = [14, 30, 90];
const GROUPS$1 = [{
  g: 1,
  label: "Daily"
}, {
  g: 3,
  label: "3-day"
}, {
  g: 7,
  label: "Weekly"
}];
const REDS = ["bg-red-50 text-red-700", "bg-red-100 text-red-800", "bg-red-200 text-red-900", "bg-red-300 text-red-900", "bg-red-400 text-white", "bg-red-500 text-white"];
function colorSeries(vals) {
  const out = [];
  let streak = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i === 0) {
      out.push("");
      continue;
    }
    const cur = vals[i], prev = vals[i - 1];
    if (cur > prev) {
      streak = 0;
      const ch = prev === 0 ? 1 : (cur - prev) / Math.abs(prev);
      out.push(ch > 0.2 ? "bg-emerald-200 text-emerald-900" : "bg-emerald-100 text-emerald-800");
    } else {
      out.push(REDS[Math.min(streak, REDS.length - 1)]);
      streak++;
    }
  }
  return out;
}
const dailyDashboard = UNSAFE_withComponentProps(function DailyDashboard() {
  const [days, setDays] = useState(30);
  const [group, setGroup] = useState(1);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (d) => {
    setLoading(true);
    setError("");
    try {
      const end = isoDate$1(/* @__PURE__ */ new Date());
      const start = isoDate$1(new Date(Date.now() - (d - 1) * 864e5));
      const token = await getToken();
      const [dbRes, visRes] = await Promise.all([fetch(`/api/dashboard?start=${start}&end=${end}`, {
        credentials: "include",
        headers: token ? {
          Authorization: `Bearer ${token}`
        } : {}
      }).then((r) => r.json()), phQuery$2(`SELECT toDate(timestamp) AS day, uniq(person_id) AS v FROM events WHERE event='$pageview' AND timestamp >= toDateTime('${start} 00:00:00') AND timestamp <= toDateTime('${end} 23:59:59') GROUP BY day`)]);
      if (dbRes.error) throw new Error(dbRes.error);
      const visMap = {};
      for (const r of visRes.results ?? []) visMap[String(r[0]).slice(0, 10)] = +r[1] || 0;
      setDaily((dbRes.daily ?? []).map((r) => ({
        ...r,
        visitors: visMap[r.day] || 0
      })));
    } catch (e) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(days);
  }, [days, load]);
  const buckets = [];
  for (let i = 0; i < daily.length; i += group) {
    const chunk = daily.slice(i, i + group);
    if (!chunk.length) continue;
    const sum = (k) => chunk.reduce((a, r) => a + (r[k] || 0), 0);
    const emails = sum("emails");
    const replies = sum("replies");
    buckets.push({
      label: group === 1 ? niceDay(chunk[0].day) : `${niceDay(chunk[0].day)}–${niceDay(chunk[chunk.length - 1].day)}`,
      data: {
        visitors: sum("visitors"),
        signups: sum("signups"),
        orders: sum("orders"),
        emails,
        replies,
        paid: sum("paid"),
        replyRate: emails ? Math.round(replies / emails * 1e3) / 10 : 0
      }
    });
  }
  const colorByMetric = {};
  for (const m of METRICS) colorByMetric[m.key] = colorSeries(buckets.map((b) => b.data[m.key] || 0));
  const order = buckets.map((_, i) => i).reverse();
  const T = (k) => daily.reduce((a, r) => a + (r[k] || 0), 0);
  const totEmails = T("emails");
  const totReplies = T("replies");
  const cards = [{
    label: "Total Visitors",
    v: fmt$2(T("visitors"))
  }, {
    label: "Total Signups",
    v: fmt$2(T("signups"))
  }, {
    label: "Outreach Orders",
    v: fmt$2(T("orders"))
  }, {
    label: "Emails Sent",
    v: fmt$2(totEmails)
  }, {
    label: "Replies",
    v: fmt$2(totReplies)
  }, {
    label: "Avg Reply Rate",
    v: `${totEmails ? Math.round(totReplies / totEmails * 1e3) / 10 : 0}%`
  }, {
    label: "Paid Conversions",
    v: fmt$2(T("paid"))
  }];
  const cl = daily.map((d) => niceDay(d.day));
  const r1 = (n, d) => d ? Math.round(n / d * 1e3) / 10 : 0;
  const chartData = {
    volume: {
      labels: cl,
      datasets: [{
        label: "Visitors",
        data: daily.map((d) => d.visitors || 0),
        yAxisID: "y",
        borderColor: "#7c3aed",
        backgroundColor: "rgba(124,58,237,0.12)",
        fill: true,
        tension: 0.35,
        pointRadius: 0
      }, {
        label: "Signups",
        data: daily.map((d) => d.signups || 0),
        yAxisID: "y1",
        borderColor: "#10b981",
        tension: 0.35,
        pointRadius: 0
      }]
    },
    conv: {
      labels: cl,
      datasets: [{
        label: "Visitor → Signup %",
        data: daily.map((d) => r1(d.signups, d.visitors)),
        borderColor: "#10b981",
        tension: 0.35,
        pointRadius: 0
      }, {
        label: "Signup → Outreach order %",
        data: daily.map((d) => r1(d.orders, d.signups)),
        borderColor: "#f59e0b",
        tension: 0.35,
        pointRadius: 0
      }, {
        label: "Order → Paid %",
        data: daily.map((d) => r1(d.paid, d.orders)),
        borderColor: "#ec4899",
        tension: 0.35,
        pointRadius: 0
      }]
    },
    engage: {
      labels: cl,
      datasets: [{
        label: "Emails sent",
        data: daily.map((d) => d.emails || 0),
        backgroundColor: "#c4b5fd",
        yAxisID: "y"
      }, {
        label: "Reply rate %",
        type: "line",
        data: daily.map((d) => r1(d.replies, d.emails)),
        borderColor: "#7c3aed",
        yAxisID: "y1",
        tension: 0.35,
        pointRadius: 0
      }]
    }
  };
  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top"
      }
    }
  };
  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[100rem] px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Clash_Display'] text-3xl font-bold text-neutral-900",
            children: "Daily Dashboard"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-600 mt-1",
            children: "Newest date first. Green = grew vs the previous day; red = flat or down, getting darker the longer it stays without an uptick."
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex flex-wrap items-center gap-2",
          children: [/* @__PURE__ */ jsx("div", {
            className: "flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
            children: GROUPS$1.map((x) => /* @__PURE__ */ jsx("button", {
              onClick: () => setGroup(x.g),
              className: `rounded-lg px-2.5 py-1 text-xs font-semibold ${group === x.g ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`,
              children: x.label
            }, x.g))
          }), PRESETS.map((p) => /* @__PURE__ */ jsxs("button", {
            onClick: () => setDays(p),
            className: `rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${days === p ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`,
            children: [p, "d"]
          }, p))]
        })]
      }), error && /* @__PURE__ */ jsx("div", {
        className: "mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700",
        children: error
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex justify-center py-24",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent"
        })
      }) : /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsx("div", {
          className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-8",
          children: cards.map((c) => /* @__PURE__ */ jsxs("div", {
            className: `p-4 ${card}`,
            children: [/* @__PURE__ */ jsx("p", {
              className: "text-[11px] font-bold uppercase tracking-wide text-neutral-500",
              children: c.label
            }), /* @__PURE__ */ jsx("p", {
              className: "font-['Clash_Display'] text-2xl lg:text-3xl font-bold text-neutral-900 mt-1",
              children: c.v
            })]
          }, c.label))
        }), /* @__PURE__ */ jsxs("div", {
          className: `overflow-hidden ${card}`,
          children: [/* @__PURE__ */ jsxs("div", {
            className: "px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50 flex items-baseline justify-between",
            children: [/* @__PURE__ */ jsxs("h2", {
              className: "font-['Clash_Display'] text-lg font-bold",
              children: [GROUPS$1.find((x) => x.g === group)?.label, " view"]
            }), /* @__PURE__ */ jsxs("span", {
              className: "text-xs text-neutral-500",
              children: [buckets.length, " columns"]
            })]
          }), /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse text-sm",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "sticky left-0 z-10 bg-neutral-50 text-left px-4 py-3 font-semibold text-neutral-700 border-b border-neutral-200 min-w-[150px]",
                    children: "Metric"
                  }), order.map((ci) => /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-3 text-right font-semibold text-neutral-700 border-b border-l border-neutral-200 whitespace-nowrap",
                    children: buckets[ci].label
                  }, ci))]
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: METRICS.map((m) => /* @__PURE__ */ jsxs("tr", {
                  children: [/* @__PURE__ */ jsx("td", {
                    className: "sticky left-0 z-10 bg-white px-4 py-2.5 font-medium text-neutral-900 border-b border-neutral-100 whitespace-nowrap",
                    children: m.label
                  }), order.map((ci) => {
                    const cur = buckets[ci].data[m.key] || 0;
                    return /* @__PURE__ */ jsx("td", {
                      className: `px-3 py-2.5 text-right border-b border-l border-neutral-100 tabular-nums font-semibold ${colorByMetric[m.key][ci]}`,
                      children: m.rate ? `${cur}%` : fmt$2(cur)
                    }, ci);
                  })]
                }, m.key))
              })]
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "grid gap-6 lg:grid-cols-2 mt-8",
          children: [/* @__PURE__ */ jsxs("div", {
            className: `p-5 ${card}`,
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-lg font-bold mb-3",
              children: "Visitors & Signups"
            }), /* @__PURE__ */ jsx("div", {
              className: "h-64",
              children: /* @__PURE__ */ jsx(Line, {
                data: chartData.volume,
                options: {
                  ...baseOpts,
                  scales: {
                    y: {
                      position: "left",
                      title: {
                        display: true,
                        text: "Visitors"
                      },
                      beginAtZero: true
                    },
                    y1: {
                      position: "right",
                      title: {
                        display: true,
                        text: "Signups"
                      },
                      beginAtZero: true,
                      grid: {
                        drawOnChartArea: false
                      }
                    }
                  }
                }
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: `p-5 ${card}`,
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-lg font-bold mb-1",
              children: "Conversion rates"
            }), /* @__PURE__ */ jsx("p", {
              className: "text-xs text-neutral-500 mb-3",
              children: "Where people convert (or leak) step to step."
            }), /* @__PURE__ */ jsx("div", {
              className: "h-64",
              children: /* @__PURE__ */ jsx(Line, {
                data: chartData.conv,
                options: {
                  ...baseOpts,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: "%"
                      }
                    }
                  }
                }
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: `p-5 lg:col-span-2 ${card}`,
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-lg font-bold mb-3",
              children: "Outreach: emails sent vs reply rate"
            }), /* @__PURE__ */ jsx("div", {
              className: "h-64",
              children: /* @__PURE__ */ jsx(Bar, {
                data: chartData.engage,
                options: {
                  ...baseOpts,
                  scales: {
                    y: {
                      position: "left",
                      title: {
                        display: true,
                        text: "Emails"
                      },
                      beginAtZero: true
                    },
                    y1: {
                      position: "right",
                      title: {
                        display: true,
                        text: "Reply %"
                      },
                      beginAtZero: true,
                      grid: {
                        drawOnChartArea: false
                      }
                    }
                  }
                }
              })
            })]
          })]
        }), /* @__PURE__ */ jsx("p", {
          className: "text-xs text-neutral-400 mt-4",
          children: "Newest date first. Green = grew vs the day before; red = flat or down, deepening the longer it stays without growth. Visitors from PostHog (unique people/day); signups, orders, emails, replies, paid from Postgres. Instagram followers aren't in any system — add an IG integration or a manual entry if you want that row."
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-8",
          children: /* @__PURE__ */ jsx(SourceBreakdown, {
            start: isoDate$1(new Date(Date.now() - (days - 1) * 864e5)),
            end: isoDate$1(/* @__PURE__ */ new Date())
          })
        })]
      })]
    })]
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: dailyDashboard
}, Symbol.toStringTag, { value: "Module" }));
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const pool = new Pool({
  connectionString
});
const db = drizzle(pool);
async function verifyToken(token) {
  try {
    const jwksResult = await db.execute(
      sql`SELECT public_key, private_key FROM jwks WHERE expires_at IS NULL OR expires_at > NOW() ORDER BY created_at DESC LIMIT 1`
    );
    if (jwksResult.rows.length === 0) {
      return null;
    }
    const jwks = jwksResult.rows[0];
    const publicKey = jwks.public_key;
    const jwk = JSON.parse(publicKey);
    const alg = jwk.alg || (jwk.kty === "OKP" && jwk.crv === "Ed25519" ? "EdDSA" : "RS256");
    const key = await importJWK(jwk, alg);
    const { payload } = await jwtVerify(token, key);
    return payload.sub || payload.userId || payload.id;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}
async function getUserIdFromToken(token) {
  return verifyToken(token);
}
async function getUserInfo(userId) {
  try {
    const result = await db.execute(
      sql`SELECT id, name, email FROM "user" WHERE id = ${userId} LIMIT 1`
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      email: row.email
    };
  } catch (error) {
    console.error("Error getting user info:", error);
    return null;
  }
}
async function getUserFromRequest(request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    if (userId) {
      return getUserInfo(userId);
    }
  }
  const frontendUrl = process.env.VITE_AUTH_URL || "http://localhost:3000";
  const cookies = request.headers.get("Cookie");
  if (cookies) {
    try {
      const origin = request.headers.get("Origin") || `https://${new URL(frontendUrl).hostname}`;
      const response = await fetch(`${frontendUrl}/api/auth/share-token`, {
        method: "GET",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json",
          "User-Agent": request.headers.get("User-Agent") || "Admin-Panel/1.0",
          "Origin": origin,
          "Referer": request.headers.get("Referer") || `${origin}/`
        },
        redirect: "manual"
      });
      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          const userId = await getUserIdFromToken(data.token);
          if (userId) {
            return getUserInfo(userId);
          }
        }
      }
    } catch (error) {
      console.debug(`[auth-helper] Failed to get token from frontend:`, error);
    }
  }
  return null;
}
async function requireAdmin$1(request) {
  const user = await getUserFromRequest(request);
  if (!user) return null;
  try {
    const r = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
    const role = r.rows[0]?.role;
    return role === "admin" || role === "ops" ? user : null;
  } catch {
    return null;
  }
}
async function loader$f({
  request
}) {
  const admin = await requireAdmin$1(request);
  if (!admin) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return Response.json({
    error: "start and end required"
  }, {
    status: 400
  });
  try {
    const q = async (query) => (await db.execute(query)).rows;
    const [signups, orders, emails, replies, paid] = await Promise.all([q(sql`SELECT DATE(created_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM "user"
            WHERE DATE(created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`), q(sql`SELECT DATE(created_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM outreach_orders
            WHERE DATE(created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`), q(sql`SELECT DATE(sent_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM emails_sent
            WHERE sent_at IS NOT NULL AND is_test = false
              AND DATE(sent_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`), q(sql`SELECT DATE(reply_received_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM emails_sent
            WHERE reply_received_at IS NOT NULL AND is_test = false
              AND DATE(reply_received_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`), q(sql`SELECT DATE(created_at + INTERVAL '330 minutes') AS day, COUNT(*)::int AS n FROM payment_orders
            WHERE status IN ('paid','completed')
              AND DATE(created_at + INTERVAL '330 minutes') BETWEEN ${start}::date AND ${end}::date GROUP BY day`)]);
    const map = {};
    const dayStr = (d) => String(d).split("T")[0];
    const blank = () => ({
      day: "",
      signups: 0,
      orders: 0,
      emails: 0,
      replies: 0,
      paid: 0
    });
    const add = (rows, key) => {
      for (const r of rows) {
        const d = dayStr(r.day);
        (map[d] ??= {
          ...blank(),
          day: d
        })[key] = r.n ?? 0;
      }
    };
    add(signups, "signups");
    add(orders, "orders");
    add(emails, "emails");
    add(replies, "replies");
    add(paid, "paid");
    const out = [];
    for (let d = /* @__PURE__ */ new Date(start + "T00:00:00Z"); dayStr(d.toISOString()) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const ds = dayStr(d.toISOString());
      out.push(map[ds] ?? {
        ...blank(),
        day: ds
      });
    }
    return Response.json({
      daily: out
    });
  } catch (err) {
    return Response.json({
      error: err.message
    }, {
      status: 500
    });
  }
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$f
}, Symbol.toStringTag, { value: "Module" }));
const DEFAULT_FX = 94;
const B2B_BY_DATE = {
  "2026-06-02": 15e3,
  "2026-06-03": 2550,
  "2026-06-13": 9650
};
function istToday() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
function shift(iso, days) {
  const d = /* @__PURE__ */ new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function b2bSum(start, end) {
  return Object.entries(B2B_BY_DATE).filter(([d]) => d >= start && d <= end).reduce((s, [, v]) => s + v, 0);
}
const cents = (n) => Number(n ?? 0) / 100;
async function loader$e({
  request
}) {
  const admin = await requireAdmin$1(request);
  if (!admin) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  try {
    const url = new URL(request.url);
    const cStart = url.searchParams.get("start") ?? "";
    const cEnd = url.searchParams.get("end") ?? "";
    const hasCustom = /^\d{4}-\d{2}-\d{2}$/.test(cStart) && /^\d{4}-\d{2}-\d{2}$/.test(cEnd) && cStart <= cEnd;
    const today = istToday();
    const yesterday = shift(today, -1);
    const d7 = shift(today, -6);
    const d30 = shift(today, -29);
    const calStart = shift(today, -29);
    const q = async (query) => (await db.execute(query)).rows;
    const revRange = (start, end) => q(sql`SELECT
              COALESCE(SUM(CASE WHEN currency='INR' THEN amount_cents END),0)::bigint AS inr,
              COALESCE(SUM(CASE WHEN currency<>'INR' THEN amount_cents END),0)::bigint AS usd,
              COUNT(*)::int AS orders
            FROM payment_orders
            WHERE status='paid'
              AND DATE(created_at + INTERVAL '5.5 hours') BETWEEN ${start}::date AND ${end}::date`);
    const revAll = () => q(sql`SELECT
              COALESCE(SUM(CASE WHEN currency='INR' THEN amount_cents END),0)::bigint AS inr,
              COALESCE(SUM(CASE WHEN currency<>'INR' THEN amount_cents END),0)::bigint AS usd,
              COUNT(*)::int AS orders
            FROM payment_orders WHERE status='paid'`);
    const sigRange = (start, end) => q(sql`SELECT COUNT(*)::int AS c FROM "user"
            WHERE DATE(created_at + INTERVAL '5.5 hours') BETWEEN ${start}::date AND ${end}::date`);
    const sigAll = () => q(sql`SELECT COUNT(*)::int AS c FROM "user"`);
    const outreachRange = (start, end) => q(sql`SELECT COUNT(*)::int AS c FROM outreach_orders
            WHERE DATE(created_at + INTERVAL '5.5 hours') BETWEEN ${start}::date AND ${end}::date`);
    const outreachAll = () => q(sql`SELECT COUNT(*)::int AS c FROM outreach_orders`);
    const [rToday, rYest, r7, r30, rAll, sToday, sYest, s7, s30, sAll, oToday, oYest, o7, o30, oAll, dailyRev, dailySig] = await Promise.all([revRange(today, today), revRange(yesterday, yesterday), revRange(d7, today), revRange(d30, today), revAll(), sigRange(today, today), sigRange(yesterday, yesterday), sigRange(d7, today), sigRange(d30, today), sigAll(), outreachRange(today, today), outreachRange(yesterday, yesterday), outreachRange(d7, today), outreachRange(d30, today), outreachAll(), q(sql`SELECT DATE(created_at + INTERVAL '5.5 hours') AS day,
              COALESCE(SUM(CASE WHEN currency='INR' THEN amount_cents END),0)::bigint AS inr,
              COALESCE(SUM(CASE WHEN currency<>'INR' THEN amount_cents END),0)::bigint AS usd,
              COUNT(*)::int AS orders
            FROM payment_orders WHERE status='paid'
              AND DATE(created_at + INTERVAL '5.5 hours') >= ${calStart}::date GROUP BY day`), q(sql`SELECT DATE(created_at + INTERVAL '5.5 hours') AS day, COUNT(*)::int AS c FROM "user"
            WHERE DATE(created_at + INTERVAL '5.5 hours') >= ${calStart}::date GROUP BY day`)]);
    const triple = (row, b2b) => {
      const inr2 = cents(row?.inr), usd2 = cents(row?.usd);
      const db_ = inr2 + usd2 * DEFAULT_FX;
      return {
        inr: inr2,
        usd: usd2,
        b2b,
        revenue: db_ + b2b,
        orders: Number(row?.orders ?? 0)
      };
    };
    const num = (rows) => Number(rows[0]?.c ?? 0);
    const periods = {
      today: {
        rev: triple(rToday[0], b2bSum(today, today)),
        signups: num(sToday),
        outreach: num(oToday)
      },
      yesterday: {
        rev: triple(rYest[0], b2bSum(yesterday, yesterday)),
        signups: num(sYest),
        outreach: num(oYest)
      },
      last7: {
        rev: triple(r7[0], b2bSum(d7, today)),
        signups: num(s7),
        outreach: num(o7)
      },
      last30: {
        rev: triple(r30[0], b2bSum(d30, today)),
        signups: num(s30),
        outreach: num(o30)
      },
      allTime: {
        rev: triple(rAll[0], Object.values(B2B_BY_DATE).reduce((s, v) => s + v, 0)),
        signups: num(sAll),
        outreach: num(oAll)
      }
    };
    if (hasCustom) {
      const [cRev, cSig, cOut] = await Promise.all([revRange(cStart, cEnd), sigRange(cStart, cEnd), outreachRange(cStart, cEnd)]);
      periods.custom = {
        rev: triple(cRev[0], b2bSum(cStart, cEnd)),
        signups: num(cSig),
        outreach: num(cOut),
        start: cStart,
        end: cEnd
      };
    }
    const dayStr = (d) => String(d).split("T")[0];
    const revMap = {};
    for (const r of dailyRev) revMap[dayStr(r.day)] = r;
    const sigMap = {};
    for (const r of dailySig) sigMap[dayStr(r.day)] = r.c;
    const daily = [];
    for (let i = 0; i < 30; i++) {
      const ds = shift(calStart, i);
      const r = revMap[ds];
      const inr2 = cents(r?.inr), usd2 = cents(r?.usd);
      daily.push({
        day: ds,
        revenue: Math.round(inr2 + usd2 * DEFAULT_FX + (B2B_BY_DATE[ds] ?? 0)),
        signups: sigMap[ds] ?? 0,
        orders: Number(r?.orders ?? 0)
      });
    }
    return Response.json({
      fxRate: DEFAULT_FX,
      today,
      periods,
      daily,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (err) {
    return Response.json({
      error: err.message
    }, {
      status: 500
    });
  }
}
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
async function loader$d({
  request
}) {
  const admin = await requireAdmin$1(request);
  if (!admin) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  try {
    const res = await db.execute(sql`
      SELECT DISTINCT lower(u.email) AS email
      FROM payment_orders p
      JOIN "user" u ON u.id = p.user_id
      WHERE p.status IN ('paid', 'completed') AND u.email IS NOT NULL
    `);
    const emails = res.rows.map((r) => r.email).filter(Boolean);
    return Response.json({
      emails
    });
  } catch (err) {
    return Response.json({
      error: err.message,
      emails: []
    }, {
      status: 500
    });
  }
}
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
function formatCurrency$1(paise) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
function meta$i({}) {
  return [{
    title: "Assignments – Admin Panel"
  }, {
    name: "description",
    content: "View and manage assignment orders"
  }];
}
const assignments = UNSAFE_withComponentProps(function Assignments() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [assignments2, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filteredAssignments, setFilteredAssignments] = useState([]);
  useEffect(() => {
    if (isAuthorized) {
      loadAssignments();
    }
  }, [isAuthorized]);
  useEffect(() => {
    if (search.trim() === "") {
      setFilteredAssignments(assignments2);
    } else {
      const searchLower = search.toLowerCase();
      setFilteredAssignments(assignments2.filter((a) => a.user_name.toLowerCase().includes(searchLower) || a.user_id.toLowerCase().includes(searchLower) || a.job_id.toLowerCase().includes(searchLower) || a.status.toLowerCase().includes(searchLower)));
    }
  }, [search, assignments2]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) {
    return null;
  }
  const loadAssignments = async () => {
    try {
      setLoading(true);
      const data = await getDashboardStats();
      setAssignments(data.assignment_orders || []);
    } catch (error) {
      toast$1.error(error.message || "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };
  const handleDownload = async (jobId) => {
    try {
      const baseUrl = getControlPlaneUrl();
      const token = await getToken();
      const response = await fetch(`${baseUrl}/v1/admin/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch job");
      const job = await response.json();
      console.log("Job response:", job);
      if (job.result) {
        if (job.result.download_url) {
          console.log("Found download_url:", job.result.download_url);
          const a = document.createElement("a");
          a.href = job.result.download_url;
          a.download = `assignment-${jobId}.docx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast$1.success("Starting direct download...");
        } else {
          console.log("No download_url found, falling back to JSON");
          const blob = new Blob([JSON.stringify(job.result, null, 2)], {
            type: "application/json"
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `assignment-${jobId}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast$1.success("Download started (JSON debug)");
        }
      } else {
        toast$1.error("No result available for this assignment");
      }
    } catch (error) {
      toast$1.error(error.message || "Failed to download assignment");
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5
        },
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
          children: "Assignment Orders"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-4 font-['Satoshi'] text-base font-normal leading-6 text-gray-600",
          children: "View and manage all assignment orders"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "mt-8",
        children: /* @__PURE__ */ jsx(SearchInput, {
          onSearch: setSearch,
          placeholder: "Search by user name, user ID, job ID, or status...",
          debounceMs: 300
        })
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "mt-12 flex items-center justify-center py-20",
        children: /* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("div", {
            className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-gray-600",
            children: "Loading assignments..."
          })]
        })
      }) : /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5,
          delay: 0.1
        },
        className: "mt-8 rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] overflow-hidden",
        children: [/* @__PURE__ */ jsx("div", {
          className: "border-b-2 border-neutral-900 bg-neutral-50 px-6 py-4 md:px-8",
          children: /* @__PURE__ */ jsxs("div", {
            className: "flex items-center justify-between",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl",
              children: "All Assignments"
            }), /* @__PURE__ */ jsxs("span", {
              className: "font-['Satoshi'] text-sm text-neutral-600",
              children: [filteredAssignments.length, " ", filteredAssignments.length === 1 ? "order" : "orders"]
            })]
          })
        }), /* @__PURE__ */ jsx("div", {
          className: "overflow-x-auto",
          children: /* @__PURE__ */ jsxs("table", {
            className: "w-full border-collapse",
            children: [/* @__PURE__ */ jsx("thead", {
              children: /* @__PURE__ */ jsxs("tr", {
                className: "border-b-2 border-neutral-900 bg-neutral-50",
                children: [/* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                  children: "User"
                }), /* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                  children: "Job ID"
                }), /* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                  children: "Date"
                }), /* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                  children: "Status"
                }), /* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                  children: "Amount"
                }), /* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                  children: "Actions"
                })]
              })
            }), /* @__PURE__ */ jsx("tbody", {
              children: filteredAssignments.length === 0 ? /* @__PURE__ */ jsx("tr", {
                children: /* @__PURE__ */ jsx("td", {
                  colSpan: 6,
                  className: "px-4 py-12 text-center",
                  children: /* @__PURE__ */ jsx("p", {
                    className: "font-['Satoshi'] text-sm text-neutral-500",
                    children: search ? "No assignments found matching your search." : "No assignments found."
                  })
                })
              }) : filteredAssignments.map((order, index) => /* @__PURE__ */ jsxs(motion.tr, {
                initial: {
                  opacity: 0,
                  y: 10
                },
                animate: {
                  opacity: 1,
                  y: 0
                },
                transition: {
                  duration: 0.2,
                  delay: index * 0.02
                },
                className: "border-b border-neutral-200 transition-colors hover:bg-neutral-50",
                children: [/* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 font-['Satoshi'] text-sm font-medium text-neutral-900",
                  children: order.user_name
                }), /* @__PURE__ */ jsxs("td", {
                  className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700 font-mono",
                  children: [order.job_id.slice(0, 8), "..."]
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                  children: new Date(order.created_at).toLocaleDateString()
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: /* @__PURE__ */ jsx("span", {
                    className: `inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${order.status === "COMPLETED" ? "bg-green-100 text-green-700" : order.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`,
                    children: order.status
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 font-['Satoshi'] text-sm font-medium text-neutral-900",
                  children: formatCurrency$1(order.amount)
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: order.status === "COMPLETED" && /* @__PURE__ */ jsx("button", {
                    onClick: () => handleDownload(order.job_id),
                    className: "rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
                    children: "Download"
                  })
                })]
              }, order.job_id))
            })]
          })
        })]
      })]
    })]
  });
});
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: assignments,
  meta: meta$i
}, Symbol.toStringTag, { value: "Module" }));
function meta$h({}) {
  return [{
    title: "Dissertations – Admin Panel"
  }, {
    name: "description",
    content: "Manage dissertation submissions"
  }];
}
const dissertations = UNSAFE_withComponentProps(function Dissertations() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  useEffect(() => {
    if (isAuthorized) {
      loadSubmissions();
    }
  }, [offset, isAuthorized]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) {
    return null;
  }
  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const submissionsList = await listDissertations(limit, offset);
      setSubmissions(Array.isArray(submissionsList) ? submissionsList : []);
    } catch (error) {
      toast$1.error(error.message || "Failed to load submissions");
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };
  const formatAmount2 = (paise) => {
    return `₹${(paise / 100).toLocaleString("en-IN")}`;
  };
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
        children: "Dissertation Submissions"
      }), loading ? /* @__PURE__ */ jsx("p", {
        className: "mt-4 font-['Satoshi'] text-base text-gray-600",
        children: "Loading..."
      }) : /* @__PURE__ */ jsxs("div", {
        className: "mt-8 overflow-x-auto",
        children: [/* @__PURE__ */ jsxs("table", {
          className: "w-full border-collapse",
          children: [/* @__PURE__ */ jsx("thead", {
            children: /* @__PURE__ */ jsxs("tr", {
              className: "border-b-2 border-neutral-900",
              children: [/* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Name"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Email"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Title"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Data Type"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Payment"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Status"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Created"
              })]
            })
          }), /* @__PURE__ */ jsx("tbody", {
            children: submissions && submissions.length > 0 ? submissions.map((sub) => /* @__PURE__ */ jsxs("tr", {
              className: "border-b border-gray-200",
              children: [/* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: sub.name
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: sub.email
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: sub.dissertation_title
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: sub.data_type
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: /* @__PURE__ */ jsxs("span", {
                  className: `rounded px-2 py-1 font-['Satoshi'] text-xs ${sub.payment_status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`,
                  children: [sub.payment_status, " (", formatAmount2(sub.amount), ")"]
                })
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: /* @__PURE__ */ jsx("span", {
                  className: "rounded bg-gray-100 px-2 py-1 font-['Satoshi'] text-xs text-gray-700",
                  children: sub.status
                })
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-gray-600",
                children: new Date(sub.created_at).toLocaleDateString()
              })]
            }, sub.id)) : /* @__PURE__ */ jsx("tr", {
              children: /* @__PURE__ */ jsx("td", {
                colSpan: 7,
                className: "px-4 py-8 text-center font-['Satoshi'] text-sm text-gray-500",
                children: "No submissions found"
              })
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "mt-4 flex gap-4",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(Math.max(0, offset - limit)),
            disabled: offset === 0,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50",
            children: "Previous"
          }), /* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(offset + limit),
            disabled: submissions.length < limit,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50",
            children: "Next"
          })]
        })]
      })]
    })]
  });
});
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: dissertations,
  meta: meta$h
}, Symbol.toStringTag, { value: "Module" }));
Chart.register(ArcElement, Tooltip, Legend);
function tierLabel$1(tier) {
  if (tier === 50) return "Starter (50)";
  if (tier === 200) return "Growth (200)";
  if (tier === 350) return "Pro (350)";
  if (tier === 500) return "Scale (500)";
  return tier != null ? String(tier) : "—";
}
const STATUS_COLORS$2 = {
  created: { bg: "bg-gray-100", text: "text-gray-700" },
  leads_generating: { bg: "bg-blue-100", text: "text-blue-700" },
  leads_ready: { bg: "bg-cyan-100", text: "text-cyan-700" },
  enriching: { bg: "bg-indigo-100", text: "text-indigo-700" },
  enrichment_complete: { bg: "bg-violet-100", text: "text-violet-700" },
  campaign_setup: { bg: "bg-amber-100", text: "text-amber-700" },
  email_connected: { bg: "bg-amber-100", text: "text-amber-700" },
  campaign_running: { bg: "bg-green-100", text: "text-green-700" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
  draft: { bg: "bg-gray-100", text: "text-gray-700" },
  running: { bg: "bg-green-100", text: "text-green-700" },
  paused: { bg: "bg-amber-100", text: "text-amber-700" },
  paid: { bg: "bg-green-100", text: "text-green-700" },
  pending: { bg: "bg-amber-100", text: "text-amber-700" },
  failed: { bg: "bg-red-100", text: "text-red-700" }
};
function fmtStatus$1(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtDate$2(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}
function fmtCurrency(cents2) {
  return `₹${(cents2 / 100).toLocaleString("en-IN")}`;
}
const STYLE_COLORS = {
  warm_intro: "#8b5cf6",
  value_prop: "#3b82f6",
  company_curiosity: "#06b6d4",
  peer_to_peer: "#10b981",
  direct_ask: "#f59e0b"
};
function StatusBadge$1({ status }) {
  const c = STATUS_COLORS$2[status] ?? STATUS_COLORS$2.created;
  return /* @__PURE__ */ jsx("span", { className: `inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${c.bg} ${c.text}`, children: fmtStatus$1(status) });
}
function EmailStatBar({ label, value, total, color }) {
  const pct2 = total > 0 ? value / total * 100 : 0;
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
    /* @__PURE__ */ jsx("span", { className: "w-20 font-['Satoshi'] text-xs font-medium text-neutral-600", children: label }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden", children: /* @__PURE__ */ jsx("div", { className: `h-full rounded-full ${color}`, style: { width: `${Math.max(pct2, 1)}%` } }) }),
    /* @__PURE__ */ jsx("span", { className: "w-8 text-right font-['Satoshi'] text-xs font-medium text-neutral-700", children: value })
  ] });
}
function OrderCard({ order }) {
  const [showLog, setShowLog] = useState(false);
  const navigate = useNavigate();
  const campaign = order.campaign;
  const emailTotal = campaign ? campaign.email_stats.sent + campaign.email_stats.queued + campaign.email_stats.scheduled + campaign.email_stats.bounced + campaign.email_stats.failed : 0;
  const styleEntries = campaign ? Object.entries(campaign.style_breakdown) : [];
  return /* @__PURE__ */ jsxs("div", { className: "rounded-xl border-2 border-neutral-900 bg-white p-5 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3 flex-wrap", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsx(StatusBadge$1, { status: order.status }),
        /* @__PURE__ */ jsxs("span", { className: "font-['Satoshi'] text-xs text-neutral-500", children: [
          "Order #",
          order.id
        ] })
      ] }),
      /* @__PURE__ */ jsx("span", { className: "font-['Satoshi'] text-xs text-neutral-500", children: fmtDate$2(order.created_at) })
    ] }),
    order.is_stuck && /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-['Satoshi'] text-xs font-medium text-red-700", children: [
      "Stuck — no progress in 6+ hours (last update: ",
      fmtDate$2(order.updated_at),
      ")"
    ] }),
    order.leads_target && order.leads_target > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-1 flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Leads" }),
        /* @__PURE__ */ jsxs("span", { className: "font-['Satoshi'] text-xs text-neutral-500", children: [
          order.leads_collected ?? 0,
          " / ",
          order.leads_target
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "h-2 rounded-full bg-neutral-100 overflow-hidden", children: /* @__PURE__ */ jsx(
        "div",
        {
          className: "h-full rounded-full bg-purple-500",
          style: { width: `${Math.min((order.leads_collected ?? 0) / order.leads_target * 100, 100)}%` }
        }
      ) })
    ] }),
    order.stage_timestamps && /* @__PURE__ */ jsxs("div", { className: "mt-4", children: [
      /* @__PURE__ */ jsx("div", { className: "mb-2 font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Funnel Journey" }),
      /* @__PURE__ */ jsx("ol", { className: "space-y-1.5", children: [
        ["resume_uploaded", "Resume uploaded"],
        ["quiz_completed", "Quiz completed"],
        ["leads_generated", "Leads generated"],
        ["payment_page_reached", "Payment page reached"],
        ["payment_made", "Payment made"],
        ["gmail_connected", "Gmail connected"],
        ["email_style_selected", "Email style selected"],
        ["campaign_setup", "Campaign setup"],
        ["campaign_launched", "Campaign launched"],
        ["campaign_paused", "Campaign paused"],
        ["campaign_completed", "Campaign completed"]
      ].map(([key, label]) => {
        const ts = order.stage_timestamps?.[key];
        const reached = !!ts;
        return /* @__PURE__ */ jsxs("li", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(
            "span",
            {
              className: `inline-block h-2 w-2 rounded-full border ${reached ? "bg-violet-500 border-violet-700" : "bg-white border-neutral-300"}`
            }
          ),
          /* @__PURE__ */ jsx(
            "span",
            {
              className: `flex-1 font-['Satoshi'] text-xs ${reached ? "text-neutral-900" : "text-neutral-400"}`,
              children: label
            }
          ),
          /* @__PURE__ */ jsx("span", { className: "font-['Satoshi'] text-xs text-neutral-500 tabular-nums", children: reached ? fmtDate$2(ts) : "—" })
        ] }, key);
      }) })
    ] }),
    campaign && /* @__PURE__ */ jsxs("div", { className: "mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("span", { className: "font-['Satoshi'] text-sm font-medium text-neutral-900", children: campaign.name }),
        /* @__PURE__ */ jsx(StatusBadge$1, { status: campaign.status })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "font-['Satoshi'] text-xs text-neutral-500", children: [
        "Daily limit: ",
        campaign.daily_limit,
        " emails"
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-1.5", children: [
        /* @__PURE__ */ jsx(EmailStatBar, { label: "Sent", value: campaign.email_stats.sent, total: emailTotal, color: "bg-green-500" }),
        /* @__PURE__ */ jsx(EmailStatBar, { label: "Replied", value: campaign.email_stats.replied, total: emailTotal, color: "bg-blue-500" }),
        /* @__PURE__ */ jsx(EmailStatBar, { label: "Bounced", value: campaign.email_stats.bounced, total: emailTotal, color: "bg-red-400" }),
        /* @__PURE__ */ jsx(EmailStatBar, { label: "Queued", value: campaign.email_stats.queued, total: emailTotal, color: "bg-neutral-400" }),
        /* @__PURE__ */ jsx(EmailStatBar, { label: "Failed", value: campaign.email_stats.failed, total: emailTotal, color: "bg-orange-400" })
      ] }),
      styleEntries.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-3", children: [
        /* @__PURE__ */ jsx("span", { className: "font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Email Style Breakdown" }),
        /* @__PURE__ */ jsx("div", { className: "mt-2 h-36", children: /* @__PURE__ */ jsx(
          Doughnut,
          {
            data: {
              labels: styleEntries.map(([k]) => fmtStatus$1(k)),
              datasets: [{
                data: styleEntries.map(([, v]) => v),
                backgroundColor: styleEntries.map(([k]) => STYLE_COLORS[k] ?? "#9ca3af"),
                borderColor: "#171717",
                borderWidth: 1.5
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "right",
                  labels: {
                    font: { family: "'Satoshi', sans-serif", size: 10 },
                    padding: 8,
                    usePointStyle: true,
                    boxWidth: 8
                  }
                }
              }
            }
          }
        ) })
      ] }),
      /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => navigate(`/outreach-campaign?campaign_id=${campaign.id}`),
          className: "inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-100 transition-colors w-fit",
          children: "View Campaign Dashboard →"
        }
      )
    ] }),
    order.action_log && order.action_log.length > 0 && /* @__PURE__ */ jsxs("div", { className: "mt-3", children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: () => {
            console.log("[ActionLog] raw entries:", JSON.stringify(order.action_log));
            setShowLog(!showLog);
          },
          className: "font-['Satoshi'] text-xs font-medium text-purple-600 hover:text-purple-800",
          children: [
            showLog ? "Hide" : "Show",
            " Action Log (",
            order.action_log.length,
            ")"
          ]
        }
      ),
      showLog && /* @__PURE__ */ jsx("div", { className: "mt-2 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-1", children: order.action_log.map((entry2, i) => {
        const ts = entry2.ts ?? entry2.timestamp ?? "";
        const msg = entry2.msg ?? entry2.action ?? entry2.message ?? JSON.stringify(entry2);
        return /* @__PURE__ */ jsxs("div", { className: "font-['Satoshi'] text-xs text-neutral-600", children: [
          /* @__PURE__ */ jsx("span", { className: "font-medium text-neutral-800", children: ts ? new Date(ts).toLocaleString() : "" }),
          " ",
          msg
        ] }, i);
      }) })
    ] })
  ] });
}
function OutreachUserDetailModal({ userId, isOpen, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!userId || !isOpen) return;
    setLoading(true);
    getOutreachUserDetail(userId).then(setDetail).catch((err) => toast$1.error(err.message || "Failed to load user detail")).finally(() => setLoading(false));
  }, [userId, isOpen]);
  return /* @__PURE__ */ jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      motion.div,
      {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        onClick: onClose,
        className: "fixed inset-0 z-50 bg-black/50"
      }
    ),
    /* @__PURE__ */ jsxs(
      motion.div,
      {
        initial: { opacity: 0, scale: 0.95, y: 20 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.95, y: 20 },
        transition: { duration: 0.2 },
        className: "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[8px_8px_0px_0px_rgba(25,26,35,1)] md:p-8",
        children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-6 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx("h2", { className: "font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-900 md:text-3xl", children: "User Detail" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: onClose,
                className: "rounded-lg border-2 border-neutral-900 bg-white p-2 transition-transform hover:scale-110 hover:bg-neutral-50",
                "aria-label": "Close",
                children: /* @__PURE__ */ jsx("svg", { className: "h-5 w-5 text-neutral-900", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })
              }
            )
          ] }),
          loading ? /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center py-16", children: /* @__PURE__ */ jsxs("div", { className: "text-center", children: [
            /* @__PURE__ */ jsx("div", { className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" }),
            /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-sm text-gray-600", children: "Loading..." })
          ] }) }) : detail ? /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
            /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "User Info" }),
              /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Name" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: detail.user.name || "—" })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Email" }),
                  /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: detail.user.email })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "User ID" }),
                  /* @__PURE__ */ jsx("p", { className: "font-mono font-['Satoshi'] text-xs text-neutral-600", children: detail.user.id })
                ] }),
                /* @__PURE__ */ jsxs("div", { children: [
                  /* @__PURE__ */ jsx("label", { className: "mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600", children: "Credits" }),
                  /* @__PURE__ */ jsxs("p", { className: "font-['Satoshi'] text-base font-normal text-neutral-900", children: [
                    detail.credits.used,
                    " / ",
                    detail.credits.total,
                    " used",
                    /* @__PURE__ */ jsxs("span", { className: "ml-2 text-sm text-neutral-500", children: [
                      "(",
                      detail.credits.available,
                      " available)"
                    ] })
                  ] })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Lead Summary" }),
              /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 gap-4 md:grid-cols-4", children: [
                { label: "Total Leads", value: detail.lead_summary.total },
                { label: "With Email", value: detail.lead_summary.with_email },
                { label: "Verified", value: detail.lead_summary.email_verified },
                { label: "Avg Score", value: detail.lead_summary.avg_score }
              ].map((item) => /* @__PURE__ */ jsxs("div", { className: "rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-center", children: [
                /* @__PURE__ */ jsx("div", { className: "font-['Clash_Display'] text-xl font-bold text-neutral-900", children: item.value }),
                /* @__PURE__ */ jsx("div", { className: "font-['Satoshi'] text-xs text-neutral-500", children: item.label })
              ] }, item.label)) })
            ] }),
            detail.payments.length > 0 && /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsx("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: "Payment History" }),
              /* @__PURE__ */ jsx("div", { className: "overflow-x-auto rounded-lg border border-neutral-200", children: /* @__PURE__ */ jsxs("table", { className: "w-full border-collapse", children: [
                /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-neutral-200 bg-neutral-50", children: [
                  /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700", children: "Date" }),
                  /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700", children: "Tier" }),
                  /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700", children: "Amount" }),
                  /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700", children: "Credits" }),
                  /* @__PURE__ */ jsx("th", { className: "px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700", children: "Status" })
                ] }) }),
                /* @__PURE__ */ jsx("tbody", { children: detail.payments.map((p) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-neutral-100", children: [
                  /* @__PURE__ */ jsx("td", { className: "px-3 py-2 font-['Satoshi'] text-xs text-neutral-700", children: fmtDate$2(p.created_at) }),
                  /* @__PURE__ */ jsx("td", { className: "px-3 py-2 font-['Satoshi'] text-xs font-medium text-neutral-900", children: tierLabel$1(p.tier) }),
                  /* @__PURE__ */ jsx("td", { className: "px-3 py-2 font-['Satoshi'] text-xs font-medium text-neutral-900", children: fmtCurrency(p.amount_cents) }),
                  /* @__PURE__ */ jsx("td", { className: "px-3 py-2 font-['Satoshi'] text-xs text-neutral-700", children: p.credits_granted }),
                  /* @__PURE__ */ jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsx(StatusBadge$1, { status: p.status }) })
                ] }, p.id)) })
              ] }) })
            ] }),
            /* @__PURE__ */ jsxs("section", { children: [
              /* @__PURE__ */ jsxs("h3", { className: "mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500", children: [
                "Orders (",
                detail.orders.length,
                ")"
              ] }),
              /* @__PURE__ */ jsx("div", { className: "space-y-4", children: detail.orders.map((order) => /* @__PURE__ */ jsx(OrderCard, { order }, order.id)) })
            ] })
          ] }) : /* @__PURE__ */ jsx("div", { className: "py-16 text-center", children: /* @__PURE__ */ jsx("p", { className: "font-['Satoshi'] text-sm text-neutral-500", children: "No data available" }) })
        ]
      }
    )
  ] }) });
}
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);
const STATUS_ORDER = ["created", "profile_complete", "leads_generating", "leads_ready", "enriching", "enrichment_complete", "campaign_setup", "email_connected", "campaign_running", "completed"];
const FUNNEL_STAGE_KEYS = [{
  key: "resume_uploaded",
  short: "Resume"
}, {
  key: "quiz_completed",
  short: "Quiz"
}, {
  key: "leads_generated",
  short: "Leads"
}, {
  key: "payment_page_reached",
  short: "Pay➝"
}, {
  key: "payment_made",
  short: "Paid"
}, {
  key: "gmail_connected",
  short: "Gmail"
}, {
  key: "email_style_selected",
  short: "Style"
}, {
  key: "campaign_setup",
  short: "Setup"
}, {
  key: "campaign_launched",
  short: "Launch"
}, {
  key: "campaign_paused",
  short: "Pause"
}, {
  key: "campaign_completed",
  short: "Done"
}];
const STAGE_BADGE_COLORS = {
  resume_uploaded: {
    bg: "bg-gray-100",
    text: "text-gray-700"
  },
  quiz_completed: {
    bg: "bg-orange-100",
    text: "text-orange-700"
  },
  leads_generated: {
    bg: "bg-cyan-100",
    text: "text-cyan-700"
  },
  payment_page_reached: {
    bg: "bg-yellow-100",
    text: "text-yellow-700"
  },
  payment_made: {
    bg: "bg-lime-100",
    text: "text-lime-700"
  },
  gmail_connected: {
    bg: "bg-violet-100",
    text: "text-violet-700"
  },
  email_style_selected: {
    bg: "bg-fuchsia-100",
    text: "text-fuchsia-700"
  },
  campaign_setup: {
    bg: "bg-amber-100",
    text: "text-amber-700"
  },
  campaign_launched: {
    bg: "bg-green-100",
    text: "text-green-700"
  },
  campaign_paused: {
    bg: "bg-orange-100",
    text: "text-orange-700"
  },
  campaign_completed: {
    bg: "bg-emerald-100",
    text: "text-emerald-700"
  }
};
function formatStatus(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatCurrency(cents2) {
  return `₹${(cents2 / 100).toLocaleString("en-IN")}`;
}
function formatMonth(monthStr) {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric"
  });
}
function timeAgo$2(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 6e4);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.8)",
      padding: 12,
      titleFont: {
        family: "'Satoshi', sans-serif",
        size: 14,
        weight: "bold"
      },
      bodyFont: {
        family: "'Satoshi', sans-serif",
        size: 13
      },
      borderColor: "#171717",
      borderWidth: 2,
      cornerRadius: 8
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          family: "'Satoshi', sans-serif",
          size: 11
        },
        color: "#6b7280"
      },
      border: {
        color: "#e5e7eb",
        width: 1
      }
    },
    y: {
      grid: {
        color: "#e5e7eb",
        lineWidth: 1
      },
      ticks: {
        font: {
          family: "'Satoshi', sans-serif",
          size: 11
        },
        color: "#6b7280"
      },
      border: {
        color: "#e5e7eb",
        width: 1
      }
    }
  }
};
function meta$g({}) {
  return [{
    title: "Outreach Orders – Admin Panel"
  }, {
    name: "description",
    content: "Monitor outreach campaigns and paid users"
  }];
}
const outreachOrders = UNSAFE_withComponentProps(function OutreachOrders() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [users2, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [requestedOffset, setRequestedOffset] = useState(0);
  const loadingRef = useRef(false);
  const scrollContainerRef = useRef(null);
  const sentinelRef = useRef(null);
  const limit = 50;
  const filterKey = `${search}|${statusFilter}`;
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const loadOverview = useCallback(async () => {
    try {
      const data = await getOutreachOverview();
      setOverview(data);
    } catch (err) {
      toast$1.error(err.message || "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isAuthorized) {
      loadOverview();
    }
  }, [isAuthorized, loadOverview]);
  useEffect(() => {
    setUsers([]);
    setRequestedOffset(0);
    setHasMore(true);
    loadingRef.current = false;
  }, [filterKey]);
  useEffect(() => {
    if (!isAuthorized) return;
    let cancelled = false;
    setUsersLoading(true);
    loadingRef.current = true;
    listOutreachUsers(limit, requestedOffset, search || void 0, statusFilter || void 0).then((data) => {
      if (cancelled) return;
      const fetched = data.users || [];
      setUsers((prev) => requestedOffset === 0 ? fetched : [...prev, ...fetched]);
      setTotal(data.total || 0);
      setHasMore(requestedOffset + fetched.length < (data.total || 0));
    }).catch((err) => {
      if (cancelled) return;
      toast$1.error(err.message || "Failed to load users");
      setHasMore(false);
    }).finally(() => {
      if (!cancelled) setUsersLoading(false);
      loadingRef.current = false;
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthorized, requestedOffset, filterKey]);
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setRequestedOffset((prev) => prev + limit);
  }, [hasMore]);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root2 = scrollContainerRef.current;
    if (!sentinel || !root2) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, {
      root: root2,
      rootMargin: "200px"
    });
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore, users2.length]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) return null;
  const funnelStages = overview?.funnel ?? [];
  const funnelLabels = funnelStages.map((s) => s.label);
  const funnelData = funnelStages.map((s) => s.users_reached);
  const funnelColors = funnelStages.map((s) => {
    if (s.stage === "campaign_paused") return "#f59e0b";
    if (s.stage === "campaign_completed") return "#10b981";
    return "#8b5cf6";
  });
  const monthlyLabels = (overview?.monthly_metrics ?? []).map((m) => formatMonth(m.month));
  const monthlyEmailsSent = (overview?.monthly_metrics ?? []).map((m) => m.emails_sent);
  const monthlyReplied = (overview?.monthly_metrics ?? []).map((m) => m.emails_replied);
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5
        },
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
          children: "Outreach Orders"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-2 font-['Satoshi'] text-base font-normal leading-6 text-gray-600",
          children: "Monitor paid outreach campaigns and user activity"
        })]
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "mt-12 flex items-center justify-center py-20",
        children: /* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("div", {
            className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-gray-600",
            children: "Loading overview..."
          })]
        })
      }) : overview && /* @__PURE__ */ jsxs("div", {
        className: "space-y-10",
        children: [/* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 20
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.5,
            delay: 0.1
          },
          className: "mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4",
          children: [/* @__PURE__ */ jsx(StatCard$2, {
            value: overview.funnel?.find((s) => s.stage === "resume_uploaded")?.users_reached ?? overview.active_orders,
            label: "Funnel Entries",
            color: "orange",
            delay: 0
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: overview.stuck_orders,
            label: "Stuck Orders",
            color: "pink",
            delay: 0.1
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: formatCurrency(overview.total_revenue_cents),
            label: "Total Revenue",
            color: "green",
            delay: 0.2
          }), /* @__PURE__ */ jsx(StatCard$2, {
            value: `${overview.reply_rate_pct}%`,
            label: "Reply Rate",
            color: "purple",
            delay: 0.3
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 20
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.5,
            delay: 0.2
          },
          className: "grid grid-cols-1 gap-6 md:grid-cols-2",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "mb-1 font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl",
              children: "Funnel — 12 Stages"
            }), /* @__PURE__ */ jsx("p", {
              className: "mb-4 font-['Satoshi'] text-xs text-neutral-500",
              children: "Distinct users who reached each stage. Drop-off % is vs the previous main-flow stage."
            }), /* @__PURE__ */ jsx("div", {
              className: "h-[420px]",
              children: funnelLabels.length > 0 ? /* @__PURE__ */ jsx(Bar, {
                data: {
                  labels: funnelLabels,
                  datasets: [{
                    label: "Users",
                    data: funnelData,
                    backgroundColor: funnelColors,
                    borderColor: "#171717",
                    borderWidth: 2
                  }]
                },
                options: {
                  ...chartOptions,
                  indexAxis: "y",
                  plugins: {
                    ...chartOptions.plugins,
                    tooltip: {
                      ...chartOptions.plugins.tooltip,
                      callbacks: {
                        label: (ctx) => {
                          const stage = funnelStages[ctx.dataIndex];
                          if (!stage) return `${ctx.parsed.x} users`;
                          const lines = [`${stage.users_reached} users`];
                          if (stage.drop_off_from_prev !== null && stage.drop_off_pct_from_prev !== null) {
                            lines.push(`Drop-off: ${stage.drop_off_from_prev} (${stage.drop_off_pct_from_prev}%)`);
                          }
                          return lines;
                        }
                      }
                    }
                  }
                }
              }) : /* @__PURE__ */ jsx("div", {
                className: "flex h-full items-center justify-center",
                children: /* @__PURE__ */ jsx("p", {
                  className: "font-['Satoshi'] text-sm text-neutral-500",
                  children: "No funnel data yet (run the backfill script)"
                })
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "mb-6 font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl",
              children: "Email Trend (12 Months)"
            }), /* @__PURE__ */ jsx("div", {
              className: "h-64",
              children: monthlyLabels.length > 0 ? /* @__PURE__ */ jsx(Line, {
                data: {
                  labels: monthlyLabels,
                  datasets: [{
                    label: "Sent",
                    data: monthlyEmailsSent,
                    borderColor: "#8b5cf6",
                    backgroundColor: "rgba(139,92,246,0.1)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#8b5cf6",
                    pointBorderColor: "#171717",
                    pointBorderWidth: 2
                  }, {
                    label: "Replied",
                    data: monthlyReplied,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16,185,129,0.1)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: "#10b981",
                    pointBorderColor: "#171717",
                    pointBorderWidth: 2
                  }]
                },
                options: {
                  ...chartOptions,
                  plugins: {
                    ...chartOptions.plugins,
                    legend: {
                      display: true,
                      position: "top",
                      labels: {
                        font: {
                          family: "'Satoshi', sans-serif",
                          size: 12
                        },
                        usePointStyle: true,
                        padding: 15
                      }
                    }
                  }
                }
              }) : /* @__PURE__ */ jsx("div", {
                className: "flex h-full items-center justify-center",
                children: /* @__PURE__ */ jsx("p", {
                  className: "font-['Satoshi'] text-sm text-neutral-500",
                  children: "No email data yet"
                })
              })
            })]
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 10
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.3,
            delay: 0.3
          },
          className: "flex flex-col gap-4 md:flex-row md:items-center",
          children: [/* @__PURE__ */ jsx(SearchInput, {
            value: search,
            onChange: (val) => {
              setSearch(val);
            },
            placeholder: "Search by name or email..."
          }), /* @__PURE__ */ jsxs("select", {
            value: statusFilter,
            onChange: (e) => {
              setStatusFilter(e.target.value);
            },
            className: "rounded-2xl border-2 border-neutral-900 bg-white px-4 py-3 font-['Satoshi'] text-base font-normal text-neutral-900 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-shadow focus:outline-none focus:shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("option", {
              value: "",
              children: "All Statuses"
            }), STATUS_ORDER.map((s) => /* @__PURE__ */ jsx("option", {
              value: s,
              children: formatStatus(s)
            }, s))]
          })]
        }), usersLoading && users2.length === 0 ? /* @__PURE__ */ jsx("div", {
          className: "flex items-center justify-center py-16",
          children: /* @__PURE__ */ jsxs("div", {
            className: "text-center",
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
            }), /* @__PURE__ */ jsx("p", {
              className: "font-['Satoshi'] text-sm text-gray-600",
              children: "Loading users..."
            })]
          })
        }) : users2.length > 0 ? /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsx("div", {
            ref: scrollContainerRef,
            className: "overflow-x-auto overflow-y-auto max-h-[640px] rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse",
              children: [/* @__PURE__ */ jsx("thead", {
                className: "sticky top-0 z-10 bg-neutral-50 shadow-[0_2px_0_0_rgba(25,26,35,1)]",
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "User"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Status"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Journey"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-3 py-4 text-center font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Alert"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Leads"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Emails"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Revenue"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Last Active"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950"
                  })]
                })
              }), /* @__PURE__ */ jsxs("tbody", {
                children: [users2.map((u) => {
                  const stageKey = u.current_stage ?? null;
                  const stageLabel = u.current_stage_label ?? null;
                  const stageColor = stageKey ? STAGE_BADGE_COLORS[stageKey] : null;
                  return /* @__PURE__ */ jsxs("tr", {
                    onClick: () => {
                      setSelectedUserId(u.user_id);
                      setIsModalOpen(true);
                    },
                    className: "cursor-pointer border-b border-neutral-200 transition-colors hover:bg-neutral-50",
                    children: [/* @__PURE__ */ jsxs("td", {
                      className: "px-4 py-4",
                      children: [/* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-sm font-medium text-neutral-950",
                        children: u.user_name || "—"
                      }), /* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-xs text-neutral-500",
                        children: u.user_email
                      })]
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4",
                      children: stageLabel && stageColor ? /* @__PURE__ */ jsx("span", {
                        className: `inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${stageColor.bg} ${stageColor.text}`,
                        children: stageLabel
                      }) : /* @__PURE__ */ jsx("span", {
                        className: "font-['Satoshi'] text-xs text-neutral-400",
                        children: "No stage reached"
                      })
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-4",
                      children: /* @__PURE__ */ jsx("div", {
                        className: "flex items-center gap-1",
                        children: FUNNEL_STAGE_KEYS.map(({
                          key,
                          short
                        }) => {
                          const ts = u.stage_timestamps?.[key];
                          const reached = !!ts;
                          const isPause = key === "campaign_paused";
                          const isDone = key === "campaign_completed";
                          const fill = reached ? isDone ? "bg-emerald-500 border-emerald-700" : isPause ? "bg-amber-500 border-amber-700" : "bg-violet-500 border-violet-700" : "bg-white border-neutral-300";
                          return /* @__PURE__ */ jsx("span", {
                            title: `${short}${ts ? `: ${new Date(ts).toLocaleString()}` : " — not reached"}`,
                            className: `inline-block h-2.5 w-2.5 rounded-full border ${fill}`
                          }, key);
                        })
                      })
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-3 py-4 text-center",
                      children: u.is_stuck && /* @__PURE__ */ jsx("span", {
                        className: "inline-block h-3 w-3 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]",
                        title: "Stuck — no update in 6h+"
                      })
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm text-neutral-700",
                      children: u.total_leads.toLocaleString()
                    }), /* @__PURE__ */ jsxs("td", {
                      className: "px-4 py-4",
                      children: [/* @__PURE__ */ jsxs("div", {
                        className: "font-['Satoshi'] text-sm text-neutral-700",
                        children: [u.total_emails_sent, " sent"]
                      }), /* @__PURE__ */ jsxs("div", {
                        className: "font-['Satoshi'] text-xs text-neutral-500",
                        children: [u.total_emails_replied, " replied / ", u.total_emails_bounced, " bounced"]
                      })]
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm font-medium text-neutral-900",
                      children: formatCurrency(u.total_paid_cents)
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4 font-['Satoshi'] text-sm text-neutral-600",
                      children: timeAgo$2(u.active_order_updated_at)
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-4",
                      children: u.active_order_status === "campaign_running" && u.active_campaign_id && /* @__PURE__ */ jsx("button", {
                        onClick: (e) => {
                          e.stopPropagation();
                          navigate(`/outreach-campaign?campaign_id=${u.active_campaign_id}&user_id=${u.user_id}`);
                        },
                        className: "inline-flex items-center gap-1 rounded-lg border-2 border-violet-900 bg-violet-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
                        children: "View Campaign →"
                      })
                    })]
                  }, u.user_id);
                }), hasMore && /* @__PURE__ */ jsx("tr", {
                  ref: sentinelRef,
                  children: /* @__PURE__ */ jsx("td", {
                    colSpan: 9,
                    className: "py-6 text-center",
                    children: usersLoading ? /* @__PURE__ */ jsx("span", {
                      className: "font-['Satoshi'] text-sm text-neutral-500",
                      children: "Loading more…"
                    }) : /* @__PURE__ */ jsx("span", {
                      className: "inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-violet-400 border-r-transparent"
                    })
                  })
                }), !hasMore && /* @__PURE__ */ jsx("tr", {
                  children: /* @__PURE__ */ jsxs("td", {
                    colSpan: 9,
                    className: "py-4 text-center font-['Satoshi'] text-xs text-neutral-400",
                    children: ["End of list — all ", total, " users loaded"]
                  })
                })]
              })]
            })
          }), /* @__PURE__ */ jsx("div", {
            className: "mt-4 flex items-center justify-between gap-4 flex-wrap",
            children: /* @__PURE__ */ jsxs("p", {
              className: "font-['Satoshi'] text-sm text-neutral-600",
              children: ["Showing ", /* @__PURE__ */ jsx("span", {
                className: "font-bold text-neutral-900",
                children: users2.length
              }), " ", "of ", /* @__PURE__ */ jsx("span", {
                className: "font-bold text-neutral-900",
                children: total
              }), " users", search && ` matching "${search}"`, !hasMore && total > 0 && " — scroll to top to view earlier rows"]
            })
          })]
        }) : /* @__PURE__ */ jsx(motion.div, {
          initial: {
            opacity: 0
          },
          animate: {
            opacity: 1
          },
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-base text-neutral-600",
            children: search || statusFilter ? "No users found matching your filters" : "No outreach users yet"
          })
        })]
      }), /* @__PURE__ */ jsx(OutreachUserDetailModal, {
        userId: selectedUserId,
        isOpen: isModalOpen,
        onClose: () => {
          setIsModalOpen(false);
          setSelectedUserId(null);
        }
      })]
    })]
  });
});
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: outreachOrders,
  meta: meta$g
}, Symbol.toStringTag, { value: "Module" }));
function meta$f() {
  return [{
    title: "Campaign Health – Admin Panel"
  }, {
    name: "description",
    content: "Funnel-by-funnel breakdown of every paid user's campaign status"
  }];
}
function headers() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache"
  };
}
async function loader$c({}) {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache"
    }
  });
}
function fmt$1(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short"
  });
}
function ago(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 6e4);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtMoney(cents2, currency) {
  if (currency === "INR") return `₹${(cents2 / 100).toLocaleString("en-IN")}`;
  return `$${(cents2 / 100).toFixed(0)}`;
}
function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
}
const CAMPAIGN_BADGE = {
  running: "bg-green-100 text-green-800 border-green-300",
  paused: "bg-amber-100 text-amber-800 border-amber-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  draft: "bg-neutral-100 text-neutral-600 border-neutral-300"
};
function healthSignal(u) {
  const c = u.campaign;
  if (!c || c.status !== "running") return {
    icon: "",
    label: "N/A",
    color: "text-neutral-400"
  };
  const s = c.stats;
  const contacted = s.leads_contacted;
  if (s.failed > 50 || contacted > 20 && s.failed / (contacted + s.failed) > 0.3) return {
    icon: "",
    label: "High failures",
    color: "text-red-600"
  };
  if (contacted > 50 && s.replied === 0) return {
    icon: "",
    label: "0 replies",
    color: "text-red-600"
  };
  if (contacted === 0 && s.queued === 0) return {
    icon: "",
    label: "Queue stuck",
    color: "text-red-600"
  };
  if (s.bounced / Math.max(contacted, 1) > 0.04) return {
    icon: "",
    label: "High bounce",
    color: "text-orange-600"
  };
  if (s.last_email_sent && daysSince(s.last_email_sent) >= 2 && s.queued === 0) return {
    icon: "",
    label: "Silent 2d+",
    color: "text-yellow-600"
  };
  return {
    icon: "",
    label: "Healthy",
    color: "text-green-700"
  };
}
function SectionHeader({
  title,
  count,
  color
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: `flex items-center gap-3 rounded-xl border-2 border-neutral-900 px-4 py-3 ${color} shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`,
    children: [/* @__PURE__ */ jsx("span", {
      className: "font-['Clash_Display'] text-lg font-medium text-neutral-950",
      children: title
    }), /* @__PURE__ */ jsx("span", {
      className: "ml-auto rounded-full border border-neutral-900 bg-white px-2.5 py-0.5 font-['Satoshi'] text-sm font-bold text-neutral-900",
      children: count
    })]
  });
}
const STAGE_DOTS = [{
  key: "resume_uploaded",
  short: "Resume"
}, {
  key: "quiz_completed",
  short: "Quiz"
}, {
  key: "leads_generated",
  short: "Leads"
}, {
  key: "gmail_connected",
  short: "Gmail"
}, {
  key: "email_style_selected",
  short: "Style"
}, {
  key: "campaign_launched",
  short: "Launch"
}, {
  key: "campaign_paused",
  short: "Pause"
}, {
  key: "campaign_completed",
  short: "Done"
}];
function FunnelDots({
  ts,
  gmailConnected,
  funnelStatus
}) {
  const campaignCompleted = !!ts.campaign_completed;
  const currentlyPaused = funnelStatus === "paused" || funnelStatus === "cancelled";
  return /* @__PURE__ */ jsx("div", {
    className: "flex items-center gap-2",
    children: STAGE_DOTS.map(({
      key,
      short
    }) => {
      const reached = key === "gmail_connected" ? gmailConnected === true || !!ts[key] : key === "campaign_paused" ? !!ts[key] && !campaignCompleted && currentlyPaused : !!ts[key];
      const isPause = key === "campaign_paused";
      const isDone = key === "campaign_completed";
      const dotFill = reached ? isDone ? "bg-emerald-500 border-emerald-700" : isPause ? "bg-amber-500 border-amber-700" : "bg-violet-500 border-violet-700" : "bg-white border-neutral-300";
      const dateLabel = ts[key] ? fmt$1(ts[key]) : reached ? "connected" : "—";
      return /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col items-center gap-0.5",
        title: `${short}: ${dateLabel}`,
        children: [/* @__PURE__ */ jsx("span", {
          className: `inline-block h-2.5 w-2.5 rounded-full border ${dotFill}`
        }), /* @__PURE__ */ jsx("span", {
          className: `font-['Satoshi'] text-[9px] leading-none ${reached ? "text-neutral-500" : "text-neutral-300"}`,
          children: short
        })]
      }, key);
    })
  });
}
function StatPill({
  value,
  label,
  color
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: `flex flex-col items-center rounded-lg border border-neutral-200 px-3 py-1.5 ${color}`,
    children: [/* @__PURE__ */ jsx("span", {
      className: "font-['Clash_Display'] text-base font-bold text-neutral-900",
      children: value
    }), /* @__PURE__ */ jsx("span", {
      className: "font-['Satoshi'] text-[10px] uppercase tracking-wide text-neutral-500",
      children: label
    })]
  });
}
function UserRow({
  u,
  showCampaign = false,
  showHealth = false,
  showDays = false,
  onSelect
}) {
  const signal = healthSignal(u);
  const c = u.campaign;
  return /* @__PURE__ */ jsxs(motion.tr, {
    initial: {
      opacity: 0,
      y: 6
    },
    animate: {
      opacity: 1,
      y: 0
    },
    onClick: () => onSelect(u),
    className: "cursor-pointer border-b border-neutral-100 transition-colors hover:bg-violet-50",
    children: [/* @__PURE__ */ jsxs("td", {
      className: "px-4 py-3",
      children: [/* @__PURE__ */ jsx("div", {
        className: "font-['Satoshi'] text-sm font-semibold text-neutral-900",
        children: u.name || "—"
      }), /* @__PURE__ */ jsx("div", {
        className: "font-['Satoshi'] text-xs text-neutral-500",
        children: u.email
      })]
    }), /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3 font-['Satoshi'] text-sm font-semibold text-neutral-900",
      children: fmtMoney(u.total_paid_cents, u.currency)
    }), /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3",
      children: /* @__PURE__ */ jsx(FunnelDots, {
        ts: u.stage_timestamps,
        gmailConnected: u.gmail_connected,
        funnelStatus: u.funnel_status
      })
    }), /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-600",
      children: fmt$1(u.paid_at)
    }), showDays && /* @__PURE__ */ jsxs("td", {
      className: "px-4 py-3 font-['Satoshi'] text-sm text-red-600 font-semibold",
      children: [daysSince(u.paid_at), "d"]
    }), showCampaign && /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3",
      children: c ? /* @__PURE__ */ jsx("span", {
        className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium capitalize ${CAMPAIGN_BADGE[c.status] ?? CAMPAIGN_BADGE.draft}`,
        children: c.status
      }) : /* @__PURE__ */ jsx("span", {
        className: "font-['Satoshi'] text-xs text-neutral-400",
        children: "—"
      })
    }), showCampaign && c && /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3",
      children: /* @__PURE__ */ jsxs("div", {
        className: "flex items-center gap-1.5",
        children: [/* @__PURE__ */ jsx(StatPill, {
          value: c.stats.leads_contacted,
          label: "Reached",
          color: "bg-green-50"
        }), /* @__PURE__ */ jsx(StatPill, {
          value: c.stats.leads_contacted + (c.stats.followups_sent || 0),
          label: "Sent",
          color: "bg-blue-50"
        }), /* @__PURE__ */ jsx(StatPill, {
          value: c.stats.replied + (c.stats.followups_replied || 0),
          label: c.stats.followups_replied > 0 ? `Reply (+${c.stats.followups_replied} f/u)` : "Reply",
          color: "bg-emerald-50"
        }), /* @__PURE__ */ jsx(StatPill, {
          value: c.stats.failed,
          label: "Failed",
          color: "bg-red-50"
        }), (c.stats.replacements_bounce || 0) + (c.stats.replacements_enrichment || 0) > 0 && /* @__PURE__ */ jsx(StatPill, {
          value: (c.stats.replacements_bounce || 0) + (c.stats.replacements_enrichment || 0),
          label: "Replaced",
          color: "bg-sky-50"
        }), /* @__PURE__ */ jsx(StatPill, {
          value: `${c.stats.reply_rate}%`,
          label: "Rate",
          color: "bg-violet-50"
        })]
      })
    }), showCampaign && !c && /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-400",
      children: "—"
    }), showHealth && /* @__PURE__ */ jsx("td", {
      className: `px-4 py-3 font-['Satoshi'] text-sm font-medium ${signal.color}`,
      children: signal.label
    }), showCampaign && c && /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-500",
      children: ago(c.stats.last_email_sent)
    }), showCampaign && !c && /* @__PURE__ */ jsx("td", {
      className: "px-4 py-3"
    })]
  });
}
function Table({
  headers: headers2,
  children
}) {
  return /* @__PURE__ */ jsx("div", {
    className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
    children: /* @__PURE__ */ jsxs("table", {
      className: "w-full border-collapse",
      children: [/* @__PURE__ */ jsx("thead", {
        children: /* @__PURE__ */ jsx("tr", {
          className: "border-b-2 border-neutral-900 bg-neutral-50",
          children: headers2.map((h) => /* @__PURE__ */ jsx("th", {
            className: "px-4 py-3 text-left font-['Satoshi'] text-xs font-bold uppercase tracking-wider text-neutral-500",
            children: h
          }, h))
        })
      }), /* @__PURE__ */ jsx("tbody", {
        children
      })]
    })
  });
}
function DetailModal$1({
  user,
  onClose
}) {
  if (!user) return null;
  const c = user.campaign;
  const p = user.profile;
  const lq = user.lead_quality;
  return /* @__PURE__ */ jsx(AnimatePresence, {
    children: user && /* @__PURE__ */ jsxs(Fragment, {
      children: [/* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0
        },
        animate: {
          opacity: 1
        },
        exit: {
          opacity: 0
        },
        onClick: onClose,
        className: "fixed inset-0 z-50 bg-black/50"
      }, "backdrop"), /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          scale: 0.95,
          y: 20
        },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0
        },
        exit: {
          opacity: 0,
          scale: 0.95,
          y: 20
        },
        transition: {
          duration: 0.2
        },
        className: "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "mb-5 flex items-start justify-between",
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-2xl font-medium text-neutral-950",
              children: user.name || user.email
            }), /* @__PURE__ */ jsx("p", {
              className: "mt-0.5 font-['Satoshi'] text-sm text-neutral-500",
              children: user.email
            }), /* @__PURE__ */ jsxs("div", {
              className: "mt-1 flex items-center gap-2",
              children: [/* @__PURE__ */ jsx("span", {
                className: "font-['Satoshi'] text-sm font-semibold text-violet-600",
                children: fmtMoney(user.total_paid_cents, user.currency)
              }), /* @__PURE__ */ jsx("span", {
                className: "font-['Satoshi'] text-sm text-neutral-400",
                children: "·"
              }), /* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-sm text-neutral-500",
                children: ["Paid ", fmt$1(user.paid_at)]
              })]
            })]
          }), /* @__PURE__ */ jsx("button", {
            onClick: onClose,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
            children: "✕ Close"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "space-y-5",
          children: [/* @__PURE__ */ jsx(ModalSection, {
            title: "Funnel Journey",
            children: /* @__PURE__ */ jsx("div", {
              className: "flex flex-wrap gap-2",
              children: STAGE_DOTS.map(({
                key,
                short
              }) => {
                const modalCompleted = !!user.stage_timestamps.campaign_completed;
                const modalCurPaused = user.funnel_status === "paused" || user.funnel_status === "cancelled";
                const reached = key === "gmail_connected" ? user.gmail_connected === true || !!user.stage_timestamps[key] : key === "campaign_paused" ? !!user.stage_timestamps[key] && !modalCompleted && modalCurPaused : !!user.stage_timestamps[key];
                const ts = user.stage_timestamps[key];
                const isPause = key === "campaign_paused";
                const isDone = key === "campaign_completed";
                const dotColor = reached ? isDone ? "bg-emerald-500" : isPause ? "bg-amber-500" : "bg-violet-500" : "bg-neutral-300";
                const borderColor = reached ? isDone ? "border-emerald-300 bg-emerald-50" : isPause ? "border-amber-300 bg-amber-50" : "border-violet-300 bg-violet-50" : "border-neutral-200 bg-neutral-50 opacity-40";
                return /* @__PURE__ */ jsxs("div", {
                  className: `flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${borderColor}`,
                  children: [/* @__PURE__ */ jsx("span", {
                    className: `h-2 w-2 rounded-full ${dotColor}`
                  }), /* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-xs font-medium text-neutral-700",
                    children: short
                  }), ts && /* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-[10px] text-neutral-400",
                    children: fmt$1(ts)
                  }), !ts && reached && /* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-[10px] text-neutral-400",
                    children: "connected"
                  })]
                }, key);
              })
            })
          }), c && /* @__PURE__ */ jsxs(ModalSection, {
            title: `Campaign — ${c.name}`,
            children: [/* @__PURE__ */ jsxs("div", {
              className: "mb-3 flex items-center gap-2",
              children: [/* @__PURE__ */ jsx("span", {
                className: `rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium capitalize ${CAMPAIGN_BADGE[c.status] ?? CAMPAIGN_BADGE.draft}`,
                children: c.status
              }), /* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-xs text-neutral-500",
                children: ["Daily limit: ", c.daily_limit]
              }), c.started_at && /* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-xs text-neutral-500",
                children: ["Started ", fmt$1(c.started_at)]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "grid grid-cols-7 gap-2",
              children: [/* @__PURE__ */ jsx(StatPill, {
                value: c.stats.leads_contacted,
                label: "Reached",
                color: "bg-green-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: c.stats.leads_contacted + (c.stats.followups_sent || 0),
                label: "Sent",
                color: "bg-blue-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: c.stats.replied,
                label: "Replied",
                color: "bg-emerald-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: c.stats.bounced,
                label: "Bounced",
                color: "bg-red-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: c.stats.failed,
                label: "Failed",
                color: "bg-orange-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: c.stats.queued,
                label: "Queued",
                color: "bg-neutral-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: `${c.stats.reply_rate}%`,
                label: "Rate",
                color: "bg-violet-50"
              })]
            }), (c.stats.replacements_bounce || 0) + (c.stats.replacements_enrichment || 0) > 0 && /* @__PURE__ */ jsxs("div", {
              className: "mt-2 flex items-center gap-2",
              children: [/* @__PURE__ */ jsx(StatPill, {
                value: c.stats.replacements_bounce || 0,
                label: "Bounce-replaced",
                color: "bg-sky-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: c.stats.replacements_enrichment || 0,
                label: "Enrich-replaced",
                color: "bg-indigo-50"
              }), /* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-xs text-neutral-500",
                children: [c.stats.replacement_cap_remaining || 0, " replacements remaining in cap"]
              })]
            }), /* @__PURE__ */ jsxs("p", {
              className: "mt-2 font-['Satoshi'] text-xs text-neutral-500",
              children: [/* @__PURE__ */ jsx("strong", {
                children: "Reached"
              }), " = unique people we sent an initial email to. ", /* @__PURE__ */ jsx("strong", {
                children: "Sent"
              }), " = total emails (incl. follow-ups). The campaign detail view shows individual email rows, so its count will match ", /* @__PURE__ */ jsx("strong", {
                children: "Sent"
              }), " plus anything still queued/cancelled."]
            }), c.stats.followups_sent > 0 && /* @__PURE__ */ jsxs("p", {
              className: "mt-1 font-['Satoshi'] text-xs text-neutral-500",
              children: ["Follow-ups: ", /* @__PURE__ */ jsx("strong", {
                children: c.stats.followups_sent
              }), " sent", c.stats.followups_replied > 0 && /* @__PURE__ */ jsxs(Fragment, {
                children: [", ", /* @__PURE__ */ jsx("strong", {
                  children: c.stats.followups_replied
                }), " replied"]
              })]
            }), c.stats.last_email_sent && /* @__PURE__ */ jsxs("p", {
              className: "mt-1 font-['Satoshi'] text-xs text-neutral-500",
              children: ["Last email: ", ago(c.stats.last_email_sent), " (", fmt$1(c.stats.last_email_sent), ")"]
            }), c.status === "running" && (() => {
              const sig = healthSignal(user);
              return sig.label !== "Healthy" ? /* @__PURE__ */ jsx("p", {
                className: `mt-2 font-['Satoshi'] text-sm font-semibold ${sig.color}`,
                children: sig.label
              }) : null;
            })(), /* @__PURE__ */ jsx("a", {
              href: `/outreach-campaign?campaign_id=${c.id}`,
              target: "_blank",
              rel: "noreferrer",
              className: "mt-3 inline-block rounded-lg border-2 border-violet-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
              children: "View All Emails →"
            })]
          }), p && /* @__PURE__ */ jsx(ModalSection, {
            title: "Student Profile",
            children: /* @__PURE__ */ jsxs("div", {
              className: "grid grid-cols-1 gap-4 md:grid-cols-2",
              children: [p.target_roles.length > 0 && /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Target Roles"
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex flex-wrap gap-1",
                  children: p.target_roles.map((r) => /* @__PURE__ */ jsx("span", {
                    className: "rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 font-['Satoshi'] text-xs text-violet-800",
                    children: r
                  }, r))
                })]
              }), p.target_industries.length > 0 && /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Target Industries"
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex flex-wrap gap-1",
                  children: p.target_industries.map((i) => /* @__PURE__ */ jsx("span", {
                    className: "rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 font-['Satoshi'] text-xs text-blue-800",
                    children: i
                  }, i))
                })]
              }), p.dream_companies.length > 0 && /* @__PURE__ */ jsxs("div", {
                className: "md:col-span-2",
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Dream Companies"
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex flex-wrap gap-1",
                  children: p.dream_companies.slice(0, 10).map((co) => /* @__PURE__ */ jsx("span", {
                    className: "rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-['Satoshi'] text-xs text-emerald-800",
                    children: co
                  }, co))
                })]
              }), p.resume_profile?.top_skills?.length > 0 && /* @__PURE__ */ jsxs("div", {
                className: "md:col-span-2",
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Top Skills (from Resume)"
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex flex-wrap gap-1",
                  children: p.resume_profile.top_skills.map((s) => /* @__PURE__ */ jsx("span", {
                    className: "rounded-full border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-['Satoshi'] text-xs text-neutral-700",
                    children: s
                  }, s))
                })]
              }), p.resume_profile?.education_level && /* @__PURE__ */ jsx(KV, {
                label: "Education",
                value: p.resume_profile.education_level
              }), p.resume_profile?.experience_years != null && /* @__PURE__ */ jsx(KV, {
                label: "Experience",
                value: `${p.resume_profile.experience_years} yrs`
              }), p.resume_profile?.geography?.city && /* @__PURE__ */ jsx(KV, {
                label: "Location",
                value: `${p.resume_profile.geography.city}, ${p.resume_profile.geography.country}`
              }), p.psychometric_profile?.traits?.length > 0 && /* @__PURE__ */ jsxs("div", {
                className: "md:col-span-2",
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Psychometric Traits"
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex flex-wrap gap-1",
                  children: p.psychometric_profile.traits.map((t) => /* @__PURE__ */ jsx("span", {
                    className: "rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 font-['Satoshi'] text-xs text-fuchsia-800",
                    children: t
                  }, t))
                })]
              }), p.flex_notes?.best_project && /* @__PURE__ */ jsxs("div", {
                className: "md:col-span-2",
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Best Project"
                }), /* @__PURE__ */ jsx("p", {
                  className: "font-['Satoshi'] text-sm text-neutral-700",
                  children: p.flex_notes.best_project
                })]
              }), p.flex_notes?.outcome && /* @__PURE__ */ jsxs("div", {
                className: "md:col-span-2",
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Desired Outcome"
                }), /* @__PURE__ */ jsx("p", {
                  className: "font-['Satoshi'] text-sm text-neutral-700",
                  children: p.flex_notes.outcome
                })]
              })]
            })
          }), lq && lq.total > 0 && /* @__PURE__ */ jsxs(ModalSection, {
            title: "Lead Quality",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "mb-4 grid grid-cols-4 gap-2",
              children: [/* @__PURE__ */ jsx(StatPill, {
                value: lq.total,
                label: "Total Leads",
                color: "bg-neutral-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: lq.with_email,
                label: "Has Email",
                color: "bg-blue-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: lq.email_verified,
                label: "Verified",
                color: "bg-green-50"
              }), /* @__PURE__ */ jsx(StatPill, {
                value: lq.avg_score != null ? lq.avg_score : "—",
                label: "Avg Score",
                color: "bg-violet-50"
              })]
            }), /* @__PURE__ */ jsx(LeadScoreCard, {
              lq
            }), /* @__PURE__ */ jsxs("div", {
              className: "grid grid-cols-1 gap-4 md:grid-cols-2",
              children: [lq.top_industries.length > 0 && /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Top Industries"
                }), lq.top_industries.map((row) => /* @__PURE__ */ jsxs("div", {
                  className: "mb-1 flex items-center justify-between",
                  children: [/* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-xs text-neutral-700 truncate max-w-[160px]",
                    children: row.label
                  }), /* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-xs font-semibold text-neutral-900",
                    children: row.count
                  })]
                }, row.label))]
              }), lq.top_titles.length > 0 && /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("p", {
                  className: "mb-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400",
                  children: "Top Titles Targeted"
                }), lq.top_titles.map((row) => /* @__PURE__ */ jsxs("div", {
                  className: "mb-1 flex items-center justify-between",
                  children: [/* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-xs text-neutral-700 truncate max-w-[160px]",
                    children: row.label
                  }), /* @__PURE__ */ jsx("span", {
                    className: "font-['Satoshi'] text-xs font-semibold text-neutral-900",
                    children: row.count
                  })]
                }, row.label))]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "mt-2 flex gap-4",
              children: [/* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-xs text-neutral-500",
                children: ["Email rate: ", /* @__PURE__ */ jsxs("strong", {
                  children: [lq.email_rate, "%"]
                })]
              }), /* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-xs text-neutral-500",
                children: ["Verified rate: ", /* @__PURE__ */ jsxs("strong", {
                  children: [lq.verified_rate, "%"]
                })]
              })]
            })]
          })]
        })]
      }, "modal")]
    })
  });
}
function ModalSection({
  title,
  children
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-xl border-2 border-neutral-200 p-4",
    children: [/* @__PURE__ */ jsx("p", {
      className: "mb-3 font-['Clash_Display'] text-sm font-medium uppercase tracking-widest text-neutral-400",
      children: title
    }), children]
  });
}
function KV({
  label,
  value
}) {
  return /* @__PURE__ */ jsxs("div", {
    children: [/* @__PURE__ */ jsx("p", {
      className: "font-['Satoshi'] text-xs text-neutral-400",
      children: label
    }), /* @__PURE__ */ jsx("p", {
      className: "font-['Satoshi'] text-sm font-medium text-neutral-800",
      children: value
    })]
  });
}
const ISSUE_DEFS = [{
  key: "auth",
  label: "Auth Expired",
  color: "bg-red-100 text-red-700 border-red-300",
  desc: "Gmail OAuth token had auth failures in the last 7 days. User likely needs to reconnect their Gmail account."
}, {
  key: "enrichment",
  label: "Enrichment",
  color: "bg-orange-100 text-orange-700 border-orange-300",
  desc: "10+ leads could not be enriched with email addresses after 3 attempts. Lead quality or targeting may be too narrow."
}, {
  key: "bounce",
  label: "High Bounce",
  color: "bg-orange-100 text-orange-700 border-orange-300",
  desc: "Bounce rate exceeds 4% on 50+ sends. Repeated bounces damage domain sender reputation and can trigger spam filters."
}, {
  key: "no_reply",
  label: "Zero Replies",
  color: "bg-red-100 text-red-700 border-red-300",
  desc: "50+ leads contacted with no responses (counting follow-ups). Emails may be landing in spam or targeting/messaging is off."
}, {
  key: "stuck",
  label: "Worker Stuck",
  color: "bg-red-100 text-red-700 border-red-300",
  desc: "Nothing sent and nothing queued despite campaign being running. The worker is not processing this campaign."
}, {
  key: "silent",
  label: "Gone Silent",
  color: "bg-yellow-100 text-yellow-700 border-yellow-300",
  desc: "No email sent in 2+ days with nothing queued. Campaign may have exhausted leads or hit daily limits."
}, {
  key: "other",
  label: "Other Failures",
  color: "bg-neutral-100 text-neutral-600 border-neutral-300",
  desc: "20+ unclassified failures. Review the email logs for specific error messages."
}];
function getIssueKeys(u) {
  const keys = [];
  const c = u.campaign;
  if (!c) return keys;
  const s = c.stats;
  const fb = s.failure_breakdown;
  const contacted = s.leads_contacted;
  if (fb && fb.auth > 0) keys.push("auth");
  if (fb && fb.enrichment >= 10) keys.push("enrichment");
  if (s.bounced > 0 && contacted >= 50 && s.bounced / contacted > 0.04) keys.push("bounce");
  if (contacted > 50 && s.replied === 0 && (s.followups_replied || 0) === 0) keys.push("no_reply");
  if (contacted === 0 && s.queued === 0) keys.push("stuck");
  if (s.last_email_sent && daysSince(s.last_email_sent) >= 2 && s.queued === 0) keys.push("silent");
  if (fb && fb.other > 20) keys.push("other");
  return keys;
}
function IssuePivotTable({
  breaking,
  onSelect
}) {
  if (breaking.length === 0) return null;
  const columns = ISSUE_DEFS.map((def) => ({
    ...def,
    users: breaking.filter((u) => getIssueKeys(u).includes(def.key))
  })).filter((col) => col.users.length > 0);
  return /* @__PURE__ */ jsx("div", {
    className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
    children: /* @__PURE__ */ jsxs("table", {
      className: "w-full border-collapse",
      children: [/* @__PURE__ */ jsx("thead", {
        children: /* @__PURE__ */ jsx("tr", {
          className: "border-b-2 border-neutral-900 bg-neutral-50",
          children: columns.map((col) => /* @__PURE__ */ jsx("th", {
            className: "px-4 py-4 text-left align-top",
            children: /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("span", {
                className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-bold ${col.color}`,
                children: col.label
              }), /* @__PURE__ */ jsx("p", {
                className: "mt-1.5 font-['Satoshi'] text-[10px] leading-snug text-neutral-400 max-w-[160px]",
                children: col.desc
              }), /* @__PURE__ */ jsx("p", {
                className: "mt-1 font-['Clash_Display'] text-lg font-bold text-neutral-900",
                children: col.users.length
              })]
            })
          }, col.key))
        })
      }), /* @__PURE__ */ jsx("tbody", {
        children: Array.from({
          length: Math.max(...columns.map((c) => c.users.length))
        }).map((_, rowIdx) => /* @__PURE__ */ jsx("tr", {
          className: "border-b border-neutral-100",
          children: columns.map((col) => {
            const u = col.users[rowIdx];
            if (!u) return /* @__PURE__ */ jsx("td", {
              className: "px-4 py-3"
            }, col.key);
            const s = u.campaign?.stats;
            return /* @__PURE__ */ jsx("td", {
              className: "px-4 py-3 align-top",
              children: /* @__PURE__ */ jsxs("button", {
                onClick: () => onSelect(u),
                className: "text-left w-full group",
                children: [/* @__PURE__ */ jsx("p", {
                  className: "font-['Satoshi'] text-sm font-semibold text-neutral-900 group-hover:text-violet-600 transition-colors",
                  children: u.name
                }), /* @__PURE__ */ jsx("p", {
                  className: "font-['Satoshi'] text-xs text-neutral-400",
                  children: u.email
                }), s && /* @__PURE__ */ jsxs("div", {
                  className: "mt-1 flex items-center gap-2 font-['Satoshi'] text-[10px] text-neutral-500",
                  children: [/* @__PURE__ */ jsxs("span", {
                    children: [s.leads_contacted, " sent"]
                  }), /* @__PURE__ */ jsx("span", {
                    children: "·"
                  }), /* @__PURE__ */ jsxs("span", {
                    className: s.failed > 0 ? "text-red-500 font-semibold" : "",
                    children: [s.failed, " failed"]
                  }), /* @__PURE__ */ jsx("span", {
                    children: "·"
                  }), /* @__PURE__ */ jsxs("span", {
                    children: [s.reply_rate, "% reply"]
                  })]
                })]
              })
            }, col.key);
          })
        }, rowIdx))
      })]
    })
  });
}
function LeadScoreCard({
  lq
}) {
  const sb = lq.score_breakdown;
  const sd = lq.score_distribution;
  if (!sb && !sd) return null;
  const avg = lq.avg_score ?? 0;
  const scoreColor = avg >= 75 ? "text-emerald-600" : avg >= 55 ? "text-amber-600" : "text-red-600";
  const scoreLabel = avg >= 75 ? "Good" : avg >= 55 ? "Fair" : "Poor";
  const dims = [{
    label: "Title",
    value: sb?.title,
    max: 35,
    min: -25,
    meaning: "Job title match vs target roles. Negative = wrong seniority level."
  }, {
    label: "Department",
    value: sb?.department,
    max: 20,
    min: 5,
    meaning: "Department alignment with student's field of study/work."
  }, {
    label: "Industry",
    value: sb?.industry,
    max: 8,
    min: 5,
    meaning: "Industry match to student's target sectors."
  }, {
    label: "Seniority",
    value: sb?.seniority,
    max: 10,
    min: 0,
    meaning: "Seniority level fit — hiring manager vs too senior/junior."
  }, {
    label: "Location",
    value: sb?.location,
    max: 8,
    min: 0,
    meaning: "Geographic relevance to student's target location."
  }];
  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-4",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "flex items-center gap-4",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("p", {
          className: `font-['Clash_Display'] text-3xl font-bold ${scoreColor}`,
          children: avg
        }), /* @__PURE__ */ jsx("p", {
          className: `font-['Satoshi'] text-xs font-medium ${scoreColor}`,
          children: scoreLabel
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-[10px] text-neutral-400",
          children: "out of 81 max"
        })]
      }), sd && /* @__PURE__ */ jsxs("div", {
        className: "flex gap-3",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("p", {
            className: "font-['Clash_Display'] text-lg font-bold text-emerald-600",
            children: sd.high
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-[10px] text-neutral-400",
            children: "High (80+)"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("p", {
            className: "font-['Clash_Display'] text-lg font-bold text-amber-600",
            children: sd.medium
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-[10px] text-neutral-400",
            children: "Medium (60-79)"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("p", {
            className: "font-['Clash_Display'] text-lg font-bold text-red-600",
            children: sd.low
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-[10px] text-neutral-400",
            children: "Low (<60)"
          })]
        })]
      })]
    }), sb && /* @__PURE__ */ jsxs("div", {
      className: "space-y-2",
      children: [dims.map((d) => {
        if (d.value === null) return null;
        const range = d.max - d.min;
        const pct2 = Math.max(0, Math.min(100, (d.value - d.min) / range * 100));
        const barColor = d.value < 0 ? "bg-red-400" : d.value < d.max * 0.5 ? "bg-amber-400" : "bg-emerald-400";
        return /* @__PURE__ */ jsxs("div", {
          title: d.meaning,
          children: [/* @__PURE__ */ jsxs("div", {
            className: "flex items-center justify-between mb-0.5",
            children: [/* @__PURE__ */ jsx("span", {
              className: "font-['Satoshi'] text-xs text-neutral-500",
              children: d.label
            }), /* @__PURE__ */ jsxs("span", {
              className: `font-['Satoshi'] text-xs font-bold ${d.value < 0 ? "text-red-600" : "text-neutral-700"}`,
              children: [d.value > 0 ? "+" : "", d.value?.toFixed(1), " / ", d.max]
            })]
          }), /* @__PURE__ */ jsx("div", {
            className: "h-2 w-full overflow-hidden rounded-full bg-neutral-100",
            children: /* @__PURE__ */ jsx("div", {
              className: `h-2 rounded-full ${barColor}`,
              style: {
                width: `${pct2}%`
              }
            })
          })]
        }, d.label);
      }), /* @__PURE__ */ jsx("p", {
        className: "font-['Satoshi'] text-[10px] text-neutral-400 mt-1",
        children: "Hover each row for what the dimension means. Title score drives overall quality — negative means wrong seniority."
      })]
    })]
  });
}
function FunnelBar({
  users: users2
}) {
  const total = users2.length;
  if (total === 0) return null;
  const stages = [{
    label: "Paid",
    count: total,
    color: "bg-neutral-500",
    note: "every real paid user"
  }, {
    label: "Started onboarding",
    count: users2.filter((u) => !!u.stage_timestamps.resume_uploaded).length,
    color: "bg-blue-400",
    note: "uploaded resume and entered the funnel"
  }, {
    label: "Gmail connected",
    // OR both sources: the bool field AND the back-filled timestamp
    count: users2.filter((u) => u.gmail_connected === true || !!u.stage_timestamps.gmail_connected).length,
    color: "bg-violet-500",
    note: "connected Gmail"
  }, {
    label: "Campaign launched",
    count: users2.filter((u) => !!u.stage_timestamps.campaign_launched).length,
    color: "bg-amber-400",
    note: "launched at least one campaign"
  }, {
    label: "Running now",
    count: users2.filter((u) => u.funnel_status === "running").length,
    color: "bg-green-500",
    note: "campaign actively running"
  }, {
    label: "Completed",
    count: users2.filter((u) => u.funnel_status === "completed").length,
    color: "bg-emerald-600",
    note: "campaign finished"
  }];
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
    children: [/* @__PURE__ */ jsxs("p", {
      className: "mb-5 font-['Clash_Display'] text-xl font-medium text-neutral-950",
      children: ["Funnel — ", total, " paid users"]
    }), /* @__PURE__ */ jsx("div", {
      className: "space-y-3",
      children: stages.map((s) => /* @__PURE__ */ jsxs("div", {
        className: "flex items-center gap-4",
        title: s.note,
        children: [/* @__PURE__ */ jsx("span", {
          className: "w-36 shrink-0 font-['Satoshi'] text-xs text-neutral-500",
          children: s.label
        }), /* @__PURE__ */ jsx("div", {
          className: "flex-1 overflow-hidden rounded-full bg-neutral-100 h-4",
          children: /* @__PURE__ */ jsx("div", {
            className: `h-4 rounded-full ${s.color} transition-all duration-500`,
            style: {
              width: `${s.count / total * 100}%`
            }
          })
        }), /* @__PURE__ */ jsx("span", {
          className: "w-8 shrink-0 text-right font-['Satoshi'] text-sm font-bold text-neutral-900",
          children: s.count
        }), /* @__PURE__ */ jsxs("span", {
          className: "w-10 shrink-0 text-right font-['Satoshi'] text-xs text-neutral-400",
          children: [Math.round(s.count / total * 100), "%"]
        })]
      }, s.label))
    })]
  });
}
const PAID_FUNNEL_VERSION = "v4";
async function fetchPaidFunnel() {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`/api/outreach?type=paid_funnel&_v=${PAID_FUNNEL_VERSION}&_t=${Date.now()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    credentials: "include",
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.users ?? [];
}
const AUTO_REFRESH_MS = 6e4;
const campaignHealth = UNSAFE_withComponentProps(function CampaignHealth() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [users2, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selected, setSelected] = useState(null);
  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const fresh = await fetchPaidFunnel();
      if (fresh.length > 0) {
        const sample = fresh.find((u) => u.email === "stayal@usc.edu") ?? fresh[0];
        console.log("[CampaignHealth] sample user:", sample.email, "| gmail_connected:", sample.gmail_connected, "| resume_ts:", sample.stage_timestamps.resume_uploaded, "| total users:", fresh.length);
      }
      setUsers(fresh);
      setLastUpdated(/* @__PURE__ */ new Date());
    } catch (err) {
      toast$1.error(err.message || "Failed to load campaign health data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);
  useEffect(() => {
    if (!isAuthorized) return;
    const interval = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [isAuthorized, load]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsx("div", {
        className: "h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
      })
    });
  }
  if (!isAuthorized) return null;
  const allRunning = users2.filter((u) => u.funnel_status === "running");
  const breaking = allRunning.filter((u) => {
    const sig = healthSignal(u);
    return sig.label !== "Healthy" && sig.label !== "N/A";
  });
  const breakingIds = new Set(breaking.map((u) => u.user_id));
  const running = allRunning.filter((u) => !breakingIds.has(u.user_id));
  const paused = users2.filter((u) => u.funnel_status === "paused" || u.funnel_status === "cancelled");
  const completed = users2.filter((u) => u.funnel_status === "completed");
  const isGmailConnected = (u) => u.gmail_connected === true || !!u.stage_timestamps.gmail_connected;
  const noGmail = users2.filter((u) => !isGmailConnected(u));
  const noLaunch = users2.filter((u) => isGmailConnected(u) && !u.stage_timestamps.campaign_launched && u.funnel_status === "gmail_connected");
  const RUNNING_HEADERS = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Health", "Last Email"];
  const PAUSED_HEADERS = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Last Email"];
  const COMPLETED_HEADERS = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Last Email"];
  const DROPOUT_HEADERS = ["User", "Paid", "Journey", "Paid On", "Days"];
  const BREAKING_HEADERS = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Health", "Last Email"];
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.4
        },
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex items-start justify-between gap-4 flex-wrap",
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h1", {
              className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
              children: "Campaign Health"
            }), /* @__PURE__ */ jsx("p", {
              className: "mt-2 font-['Satoshi'] text-base text-gray-600",
              children: "End-to-end funnel for every real paid user — click any row for full profile + lead quality drill-down."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "flex items-center gap-3 shrink-0",
            children: [lastUpdated && /* @__PURE__ */ jsxs("span", {
              className: "font-['Satoshi'] text-xs text-neutral-400",
              children: ["Updated ", ago(lastUpdated.toISOString()), refreshing && /* @__PURE__ */ jsx("span", {
                className: "ml-1 text-violet-500",
                children: "↻"
              })]
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => load(false),
              disabled: loading,
              className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-40",
              children: "Refresh"
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-['Satoshi'] text-xs text-neutral-400",
          children: [/* @__PURE__ */ jsxs("span", {
            className: "flex items-center gap-1.5",
            children: [/* @__PURE__ */ jsx("span", {
              className: "inline-block h-2 w-2 rounded-full bg-violet-500 border border-violet-700"
            }), " Reached"]
          }), /* @__PURE__ */ jsxs("span", {
            className: "flex items-center gap-1.5",
            children: [/* @__PURE__ */ jsx("span", {
              className: "inline-block h-2 w-2 rounded-full bg-amber-500 border border-amber-700"
            }), " Paused"]
          }), /* @__PURE__ */ jsxs("span", {
            className: "flex items-center gap-1.5",
            children: [/* @__PURE__ */ jsx("span", {
              className: "inline-block h-2 w-2 rounded-full bg-emerald-500 border border-emerald-700"
            }), " Completed"]
          }), /* @__PURE__ */ jsxs("span", {
            className: "flex items-center gap-1.5",
            children: [/* @__PURE__ */ jsx("span", {
              className: "inline-block h-2 w-2 rounded-full bg-white border border-neutral-300"
            }), " Not reached"]
          })]
        })]
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex items-center justify-center py-32",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-10 w-10 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        })
      }) : /* @__PURE__ */ jsxs("div", {
        className: "mt-10 space-y-10",
        children: [/* @__PURE__ */ jsx(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.05
          },
          children: /* @__PURE__ */ jsx(FunnelBar, {
            users: users2
          })
        }), breaking.length > 0 && /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.1
          },
          className: "space-y-3",
          children: [/* @__PURE__ */ jsx(SectionHeader, {
            title: "Breaking Campaigns — Needs Action",
            count: breaking.length,
            color: "bg-red-50"
          }), /* @__PURE__ */ jsx(IssuePivotTable, {
            breaking,
            onSelect: setSelected
          }), /* @__PURE__ */ jsx(Table, {
            headers: BREAKING_HEADERS,
            children: breaking.map((u) => /* @__PURE__ */ jsx(UserRow, {
              u,
              showCampaign: true,
              showHealth: true,
              onSelect: setSelected
            }, u.user_id))
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.15
          },
          className: "space-y-3",
          children: [/* @__PURE__ */ jsx(SectionHeader, {
            title: "Running — Healthy",
            count: running.length,
            color: "bg-green-50"
          }), running.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-neutral-400",
            children: "No running campaigns."
          }) : /* @__PURE__ */ jsx(Table, {
            headers: RUNNING_HEADERS,
            children: running.map((u) => /* @__PURE__ */ jsx(UserRow, {
              u,
              showCampaign: true,
              showHealth: true,
              onSelect: setSelected
            }, u.user_id))
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.2
          },
          className: "space-y-3",
          children: [/* @__PURE__ */ jsx(SectionHeader, {
            title: "Paused / Cancelled",
            count: paused.length,
            color: "bg-amber-50"
          }), paused.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-neutral-400",
            children: "None."
          }) : /* @__PURE__ */ jsx(Table, {
            headers: PAUSED_HEADERS,
            children: paused.map((u) => /* @__PURE__ */ jsx(UserRow, {
              u,
              showCampaign: true,
              onSelect: setSelected
            }, u.user_id))
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.25
          },
          className: "space-y-3",
          children: [/* @__PURE__ */ jsx(SectionHeader, {
            title: "Completed Campaigns",
            count: completed.length,
            color: "bg-emerald-50"
          }), completed.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-neutral-400",
            children: "None yet."
          }) : /* @__PURE__ */ jsx(Table, {
            headers: COMPLETED_HEADERS,
            children: completed.map((u) => /* @__PURE__ */ jsx(UserRow, {
              u,
              showCampaign: true,
              onSelect: setSelected
            }, u.user_id))
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.3
          },
          className: "space-y-3",
          children: [/* @__PURE__ */ jsx(SectionHeader, {
            title: "Connected Gmail — Never Launched",
            count: noLaunch.length,
            color: "bg-blue-50"
          }), noLaunch.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-neutral-400",
            children: "None — great!"
          }) : /* @__PURE__ */ jsx(Table, {
            headers: DROPOUT_HEADERS,
            children: noLaunch.map((u) => /* @__PURE__ */ jsx(UserRow, {
              u,
              showDays: true,
              onSelect: setSelected
            }, u.user_id))
          })]
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 16
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            duration: 0.4,
            delay: 0.35
          },
          className: "space-y-3",
          children: [/* @__PURE__ */ jsx(SectionHeader, {
            title: "Never Connected Gmail",
            count: noGmail.length,
            color: "bg-red-50"
          }), noGmail.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-neutral-400",
            children: "None — great!"
          }) : /* @__PURE__ */ jsx(Table, {
            headers: DROPOUT_HEADERS,
            children: noGmail.map((u) => /* @__PURE__ */ jsx(UserRow, {
              u,
              showDays: true,
              onSelect: setSelected
            }, u.user_id))
          })]
        })]
      })]
    }), /* @__PURE__ */ jsx(DetailModal$1, {
      user: selected,
      onClose: () => setSelected(null)
    })]
  });
});
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: campaignHealth,
  headers,
  loader: loader$c,
  meta: meta$f
}, Symbol.toStringTag, { value: "Module" }));
function meta$e({}) {
  return [{
    title: "Paid Users – Admin Panel"
  }, {
    name: "description",
    content: "All payment orders across Razorpay and Dodo"
  }];
}
function countryFlag(code) {
  if (!code || code.length !== 2) return "🌐";
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
function formatAmount(cents2, currency) {
  if (currency === "INR") {
    return `₹${(cents2 / 100).toLocaleString("en-IN")}`;
  }
  return `$${(cents2 / 100).toFixed(2)}`;
}
function tierLabel(tier) {
  if (tier === 50) return "Starter (50)";
  if (tier === 200) return "Growth (200)";
  if (tier === 350) return "Pro (350)";
  if (tier === 500) return "Scale (500)";
  return tier != null ? String(tier) : "—";
}
function tierBadgeClass(tier) {
  if (tier === 50) return "bg-amber-50 text-amber-700 border-amber-300";
  if (tier === 200) return "bg-blue-50 text-blue-700 border-blue-300";
  if (tier === 350) return "bg-violet-50 text-violet-700 border-violet-300";
  if (tier === 500) return "bg-emerald-50 text-emerald-700 border-emerald-300";
  return "bg-neutral-100 text-neutral-700 border-neutral-300";
}
function timeAgo$1(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 6e4);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
function formatDate$1(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const PROVIDER_STYLES = {
  razorpay: {
    label: "Razorpay",
    className: "bg-blue-100 text-blue-800 border-blue-300"
  },
  dodo: {
    label: "Dodo",
    className: "bg-green-100 text-green-800 border-green-300"
  },
  coupon: {
    label: "Coupon",
    className: "bg-yellow-100 text-yellow-800 border-yellow-300"
  }
};
const STATUS_STYLES = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  created: "bg-neutral-100 text-neutral-600 border-neutral-300"
};
const ORDER_STATUS_STYLES = {
  leads_ready: "bg-violet-100 text-violet-800 border-violet-300",
  campaign_running: "bg-green-100 text-green-800 border-green-300",
  campaign_setup: "bg-blue-100 text-blue-800 border-blue-300",
  enrichment_complete: "bg-orange-100 text-orange-800 border-orange-300",
  email_connected: "bg-teal-100 text-teal-800 border-teal-300",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-300"
};
const STATUS_FILTERS$3 = [{
  value: "paid",
  label: "Paid"
}, {
  value: "abandoned",
  label: "Abandoned"
}, {
  value: "all",
  label: "All"
}];
function DetailModal({
  payment,
  onClose
}) {
  if (!payment) return null;
  const providerStyle = PROVIDER_STYLES[payment.provider] ?? PROVIDER_STYLES.coupon;
  return /* @__PURE__ */ jsx(AnimatePresence, {
    children: payment && /* @__PURE__ */ jsxs(Fragment, {
      children: [/* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0
        },
        animate: {
          opacity: 1
        },
        exit: {
          opacity: 0
        },
        onClick: onClose,
        className: "fixed inset-0 z-50 bg-black/50"
      }, "backdrop"), /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          scale: 0.95,
          y: 20
        },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0
        },
        exit: {
          opacity: 0,
          scale: 0.95,
          y: 20
        },
        transition: {
          duration: 0.2
        },
        className: "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)] md:p-8",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "mb-6 flex items-start justify-between",
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsxs("h2", {
              className: "font-['Clash_Display'] text-2xl font-medium text-neutral-950",
              children: ["Payment #", payment.id]
            }), /* @__PURE__ */ jsx("p", {
              className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
              children: formatDate$1(payment.created_at)
            })]
          }), /* @__PURE__ */ jsx("button", {
            onClick: onClose,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
            children: "✕ Close"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "space-y-5",
          children: [/* @__PURE__ */ jsxs(Section, {
            title: "User",
            children: [/* @__PURE__ */ jsx(Row, {
              label: "Name",
              value: payment.user_name
            }), /* @__PURE__ */ jsx(Row, {
              label: "Email",
              value: payment.user_email,
              mono: true
            }), /* @__PURE__ */ jsx(Row, {
              label: "User ID",
              value: payment.user_id,
              mono: true,
              small: true
            })]
          }), /* @__PURE__ */ jsxs(Section, {
            title: "Payment",
            children: [/* @__PURE__ */ jsx(Row, {
              label: "Amount",
              value: formatAmount(payment.amount_cents, payment.currency)
            }), /* @__PURE__ */ jsx(Row, {
              label: "Provider",
              value: /* @__PURE__ */ jsx("span", {
                className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${providerStyle.className}`,
                children: providerStyle.label
              })
            }), /* @__PURE__ */ jsx(Row, {
              label: "Plan tier",
              value: tierLabel(payment.tier)
            }), /* @__PURE__ */ jsx(Row, {
              label: "Credits granted",
              value: String(payment.credits_granted)
            }), /* @__PURE__ */ jsx(Row, {
              label: "Status",
              value: /* @__PURE__ */ jsx("span", {
                className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium capitalize ${STATUS_STYLES[payment.status] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`,
                children: payment.status
              })
            }), /* @__PURE__ */ jsx(Row, {
              label: "Country",
              value: payment.geo_country ? `${countryFlag(payment.geo_country)} ${payment.geo_country}` : "—"
            }), payment.coupon_code && /* @__PURE__ */ jsx(Row, {
              label: "Coupon",
              value: payment.coupon_code,
              mono: true
            })]
          }), /* @__PURE__ */ jsxs(Section, {
            title: "Payment IDs",
            children: [payment.razorpay_order_id && /* @__PURE__ */ jsx(Row, {
              label: "Razorpay Order",
              value: payment.razorpay_order_id,
              mono: true,
              small: true
            }), payment.razorpay_payment_id && /* @__PURE__ */ jsx(Row, {
              label: "Razorpay Payment",
              value: payment.razorpay_payment_id,
              mono: true,
              small: true
            }), payment.dodo_checkout_id && /* @__PURE__ */ jsx(Row, {
              label: "Dodo Checkout",
              value: payment.dodo_checkout_id,
              mono: true,
              small: true
            }), payment.dodo_payment_id && /* @__PURE__ */ jsx(Row, {
              label: "Dodo Payment",
              value: payment.dodo_payment_id,
              mono: true,
              small: true
            }), !payment.razorpay_order_id && !payment.razorpay_payment_id && !payment.dodo_checkout_id && !payment.dodo_payment_id && /* @__PURE__ */ jsx("p", {
              className: "font-['Satoshi'] text-sm text-neutral-400",
              children: "No payment IDs (coupon-only)"
            })]
          }), /* @__PURE__ */ jsx(Section, {
            title: "Outreach",
            children: /* @__PURE__ */ jsx(Row, {
              label: "Order status",
              value: payment.outreach_order_status ? /* @__PURE__ */ jsx("span", {
                className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${ORDER_STATUS_STYLES[payment.outreach_order_status] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`,
                children: payment.outreach_order_status.replace(/_/g, " ")
              }) : "—"
            })
          }), /* @__PURE__ */ jsx("a", {
            href: `/outreach-orders?search=${encodeURIComponent(payment.user_email)}`,
            className: "mt-2 inline-block rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
            children: "View in Outreach Orders →"
          })]
        })]
      }, "modal")]
    })
  });
}
function Section({
  title,
  children
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-xl border-2 border-neutral-200 p-4",
    children: [/* @__PURE__ */ jsx("p", {
      className: "mb-3 font-['Clash_Display'] text-sm font-medium uppercase tracking-widest text-neutral-400",
      children: title
    }), /* @__PURE__ */ jsx("div", {
      className: "space-y-2",
      children
    })]
  });
}
function Row({
  label,
  value,
  mono,
  small
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex items-start justify-between gap-4",
    children: [/* @__PURE__ */ jsx("span", {
      className: "shrink-0 font-['Satoshi'] text-sm text-neutral-500",
      children: label
    }), /* @__PURE__ */ jsx("span", {
      className: `text-right font-['Satoshi'] text-neutral-900 ${mono ? "font-mono" : ""} ${small ? "text-xs" : "text-sm"} break-all`,
      children: value ?? "—"
    })]
  });
}
const paidUsers = UNSAFE_withComponentProps(function PaidUsers() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("paid");
  const [offset, setOffset] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const limit = 50;
  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listPayments(limit, offset, search, statusFilter);
      setPayments(data.payments ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? null);
    } catch (err) {
      toast$1.error(err.message || "Failed to load payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [offset, search, statusFilter]);
  useEffect(() => {
    if (isAuthorized) {
      loadPayments();
    }
  }, [isAuthorized, loadPayments]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) return null;
  const inrRevenue = stats ? `₹${(stats.total_inr_paise / 100).toLocaleString("en-IN")}` : "—";
  const usdRevenue = stats ? `$${(stats.total_usd_cents / 100).toFixed(2)}` : "—";
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5
        },
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
          children: "Paid Users"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-2 font-['Satoshi'] text-base font-normal leading-6 text-gray-600",
          children: "All payment orders across Razorpay and Dodo"
        })]
      }), stats && /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5,
          delay: 0.1
        },
        className: "mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4",
        children: [/* @__PURE__ */ jsx(StatCard$2, {
          value: stats.total_paid,
          label: "Paid Orders",
          color: "purple",
          delay: 0
        }), /* @__PURE__ */ jsx(StatCard$2, {
          value: inrRevenue,
          label: "INR Revenue",
          color: "green",
          delay: 0.1
        }), /* @__PURE__ */ jsx(StatCard$2, {
          value: usdRevenue,
          label: "USD Revenue",
          color: "orange",
          delay: 0.2
        }), /* @__PURE__ */ jsx(StatCard$2, {
          value: stats.total_abandoned,
          label: "Abandoned Checkouts",
          color: "pink",
          delay: 0.3
        })]
      }), /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5,
          delay: 0.2
        },
        className: "mt-8 flex flex-col gap-4 md:flex-row md:items-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "flex-1",
          children: /* @__PURE__ */ jsx(SearchInput, {
            value: search,
            onChange: (v) => {
              setSearch(v);
              setOffset(0);
            },
            placeholder: "Search by name or email..."
          })
        }), /* @__PURE__ */ jsx("div", {
          className: "flex gap-2",
          children: STATUS_FILTERS$3.map((f) => /* @__PURE__ */ jsx("button", {
            onClick: () => {
              setStatusFilter(f.value);
              setOffset(0);
            },
            className: `rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] text-sm font-medium transition-transform hover:translate-x-[1px] hover:translate-y-[1px] ${statusFilter === f.value ? "bg-neutral-900 text-white shadow-none" : "bg-white text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:shadow-none"}`,
            children: f.label
          }, f.value))
        })]
      }), /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.5,
          delay: 0.3
        },
        className: "mt-6",
        children: loading ? /* @__PURE__ */ jsx("div", {
          className: "flex items-center justify-center py-20",
          children: /* @__PURE__ */ jsxs("div", {
            className: "text-center",
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
            }), /* @__PURE__ */ jsx("p", {
              className: "font-['Satoshi'] text-sm text-gray-600",
              children: "Loading payments..."
            })]
          })
        }) : payments.length === 0 ? /* @__PURE__ */ jsxs("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-lg font-medium text-neutral-500",
            children: "No payments found"
          }), search && /* @__PURE__ */ jsx("p", {
            className: "mt-2 font-['Satoshi'] text-sm text-neutral-400",
            children: "Try clearing the search filter"
          })]
        }) : /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsx("tr", {
                  className: "border-b-2 border-neutral-900 bg-neutral-50",
                  children: ["User", "Amount", "Provider", "Plan", "Country", "Coupon", "Order Status", "Date"].map((col) => /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-4 text-left font-['Satoshi'] text-xs font-bold uppercase tracking-wider text-neutral-500",
                    children: col
                  }, col))
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: /* @__PURE__ */ jsx(AnimatePresence, {
                  mode: "popLayout",
                  children: payments.map((p, i) => {
                    const providerStyle = PROVIDER_STYLES[p.provider] ?? PROVIDER_STYLES.coupon;
                    const orderStatusClass = ORDER_STATUS_STYLES[p.outreach_order_status ?? ""] ?? "bg-neutral-100 text-neutral-600 border-neutral-300";
                    return /* @__PURE__ */ jsxs(motion.tr, {
                      initial: {
                        opacity: 0,
                        y: 10
                      },
                      animate: {
                        opacity: 1,
                        y: 0
                      },
                      exit: {
                        opacity: 0,
                        y: -10
                      },
                      transition: {
                        duration: 0.2,
                        delay: i * 0.02
                      },
                      onClick: () => setSelectedPayment(p),
                      className: "cursor-pointer border-b border-neutral-200 transition-colors last:border-b-0 hover:bg-violet-50",
                      children: [/* @__PURE__ */ jsxs("td", {
                        className: "px-4 py-4",
                        children: [/* @__PURE__ */ jsx("p", {
                          className: "font-['Satoshi'] text-sm font-semibold text-neutral-900",
                          children: p.user_name
                        }), /* @__PURE__ */ jsx("p", {
                          className: "font-['Satoshi'] text-xs text-neutral-500",
                          children: p.user_email
                        })]
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4 font-['Satoshi'] text-sm font-semibold text-neutral-900",
                        children: formatAmount(p.amount_cents, p.currency)
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4",
                        children: /* @__PURE__ */ jsx("span", {
                          className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${providerStyle.className}`,
                          children: providerStyle.label
                        })
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4",
                        children: /* @__PURE__ */ jsx("span", {
                          className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${tierBadgeClass(p.tier)}`,
                          children: tierLabel(p.tier)
                        })
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4 font-['Satoshi'] text-sm text-neutral-700",
                        children: p.geo_country ? `${countryFlag(p.geo_country)} ${p.geo_country}` : "—"
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4 font-mono text-xs text-neutral-600",
                        children: p.coupon_code ?? "—"
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4",
                        children: p.outreach_order_status ? /* @__PURE__ */ jsx("span", {
                          className: `inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${orderStatusClass}`,
                          children: p.outreach_order_status.replace(/_/g, " ")
                        }) : /* @__PURE__ */ jsx("span", {
                          className: "font-['Satoshi'] text-xs text-neutral-400",
                          children: "—"
                        })
                      }), /* @__PURE__ */ jsx("td", {
                        className: "px-4 py-4",
                        title: formatDate$1(p.created_at),
                        children: /* @__PURE__ */ jsx("span", {
                          className: "font-['Satoshi'] text-sm text-neutral-600",
                          children: timeAgo$1(p.created_at)
                        })
                      })]
                    }, p.id);
                  })
                })
              })]
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "mt-6 flex items-center justify-between",
            children: [/* @__PURE__ */ jsxs("p", {
              className: "font-['Satoshi'] text-sm text-neutral-600",
              children: ["Showing ", offset + 1, "–", Math.min(offset + payments.length, total), " of ", total]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex gap-3",
              children: [/* @__PURE__ */ jsx("button", {
                onClick: () => setOffset(Math.max(0, offset - limit)),
                disabled: offset === 0,
                className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-40 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
                children: "← Previous"
              }), /* @__PURE__ */ jsx("button", {
                onClick: () => setOffset(offset + limit),
                disabled: offset + payments.length >= total,
                className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-40 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
                children: "Next →"
              })]
            })]
          })]
        })
      })]
    }), /* @__PURE__ */ jsx(DetailModal, {
      payment: selectedPayment,
      onClose: () => setSelectedPayment(null)
    })]
  });
});
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: paidUsers,
  meta: meta$e
}, Symbol.toStringTag, { value: "Module" }));
const STATUS_COLORS$1 = {
  queued: {
    bg: "bg-neutral-100",
    text: "text-neutral-700"
  },
  scheduled: {
    bg: "bg-blue-100",
    text: "text-blue-700"
  },
  sent: {
    bg: "bg-green-100",
    text: "text-green-700"
  },
  replied: {
    bg: "bg-emerald-100",
    text: "text-emerald-700"
  },
  bounced: {
    bg: "bg-red-100",
    text: "text-red-700"
  },
  failed: {
    bg: "bg-orange-100",
    text: "text-orange-700"
  }
};
const CAMPAIGN_STATUS_COLORS = {
  running: {
    bg: "bg-green-100",
    text: "text-green-700"
  },
  paused: {
    bg: "bg-amber-100",
    text: "text-amber-700"
  },
  draft: {
    bg: "bg-gray-100",
    text: "text-gray-700"
  },
  completed: {
    bg: "bg-emerald-100",
    text: "text-emerald-700"
  }
};
function fmtStatus(s) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtDate$1(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}
function MetricPill({
  label,
  value,
  color
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: `rounded-xl border-2 border-neutral-900 ${color} p-4 text-center shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`,
    children: [/* @__PURE__ */ jsx("div", {
      className: "font-['Clash_Display'] text-2xl font-bold text-neutral-900",
      children: value
    }), /* @__PURE__ */ jsx("div", {
      className: "mt-1 font-['Satoshi'] text-xs font-medium text-neutral-700",
      children: label
    })]
  });
}
function EmailRow({
  email
}) {
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_COLORS$1[email.status] ?? STATUS_COLORS$1.queued;
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsxs("tr", {
      className: "cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 transition-colors",
      onClick: () => setExpanded(!expanded),
      children: [/* @__PURE__ */ jsxs("td", {
        className: "px-4 py-3",
        children: [/* @__PURE__ */ jsx("div", {
          className: "font-['Satoshi'] text-sm font-medium text-neutral-900",
          children: email.lead_name
        }), /* @__PURE__ */ jsx("div", {
          className: "font-['Satoshi'] text-xs text-neutral-500",
          children: email.lead_title || "—"
        })]
      }), /* @__PURE__ */ jsx("td", {
        className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
        children: email.lead_company || "—"
      }), /* @__PURE__ */ jsx("td", {
        className: "px-4 py-3",
        children: /* @__PURE__ */ jsx("span", {
          className: `inline-block rounded-lg px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${sc.bg} ${sc.text}`,
          children: fmtStatus(email.status)
        })
      }), /* @__PURE__ */ jsx("td", {
        className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-600",
        children: email.assigned_style ? fmtStatus(email.assigned_style) : "—"
      }), /* @__PURE__ */ jsx("td", {
        className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-600",
        children: fmtDate$1(email.sent_at)
      }), /* @__PURE__ */ jsx("td", {
        className: "px-4 py-3",
        children: email.reply_text ? /* @__PURE__ */ jsxs("span", {
          className: "font-['Satoshi'] text-xs text-emerald-700 font-medium",
          children: [email.reply_text.slice(0, 60), email.reply_text.length > 60 ? "…" : ""]
        }) : /* @__PURE__ */ jsx("span", {
          className: "font-['Satoshi'] text-xs text-neutral-400",
          children: "—"
        })
      }), /* @__PURE__ */ jsx("td", {
        className: "px-4 py-3 text-center",
        children: /* @__PURE__ */ jsx("span", {
          className: "font-['Satoshi'] text-xs text-neutral-400",
          children: expanded ? "▲" : "▼"
        })
      })]
    }), expanded && /* @__PURE__ */ jsx("tr", {
      className: "border-b border-neutral-100 bg-neutral-50",
      children: /* @__PURE__ */ jsx("td", {
        colSpan: 7,
        className: "px-6 py-4",
        children: /* @__PURE__ */ jsxs("div", {
          className: "grid grid-cols-1 gap-4 md:grid-cols-2",
          children: [email.subject && /* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500",
              children: "Subject"
            }), /* @__PURE__ */ jsx("div", {
              className: "font-['Satoshi'] text-sm text-neutral-800",
              children: email.subject
            })]
          }), email.to_email && /* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500",
              children: "To"
            }), /* @__PURE__ */ jsx("div", {
              className: "font-['Satoshi'] text-sm text-neutral-800",
              children: email.to_email
            })]
          }), email.body && /* @__PURE__ */ jsxs("div", {
            className: "md:col-span-2",
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500",
              children: "Email Body"
            }), /* @__PURE__ */ jsx("pre", {
              className: "whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-3 font-['Satoshi'] text-xs text-neutral-700 leading-relaxed max-h-48 overflow-y-auto",
              children: email.body
            })]
          }), email.reply_text && /* @__PURE__ */ jsxs("div", {
            className: "md:col-span-2",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500",
              children: ["Reply ", email.reply_sentiment ? `(${fmtStatus(email.reply_sentiment)})` : ""]
            }), /* @__PURE__ */ jsx("pre", {
              className: "whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-['Satoshi'] text-xs text-emerald-800 leading-relaxed max-h-48 overflow-y-auto",
              children: email.reply_text
            })]
          }), email.bounce_reason && /* @__PURE__ */ jsxs("div", {
            className: "md:col-span-2",
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500",
              children: "Bounce Reason"
            }), /* @__PURE__ */ jsx("div", {
              className: "font-['Satoshi'] text-sm text-red-700",
              children: email.bounce_reason
            })]
          }), email.error_message && email.status === "failed" && /* @__PURE__ */ jsxs("div", {
            className: "md:col-span-2",
            children: [/* @__PURE__ */ jsx("div", {
              className: "mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500",
              children: "Error"
            }), /* @__PURE__ */ jsx("div", {
              className: "font-['Satoshi'] text-sm text-red-700",
              children: email.error_message
            })]
          })]
        })
      })
    })]
  });
}
const outreachCampaign = UNSAFE_withComponentProps(function OutreachCampaignPage() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign_id");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!isAuthorized || !campaignId) return;
    setLoading(true);
    getAdminCampaignEmails(Number(campaignId)).then(setData).catch((err) => toast$1.error(err.message || "Failed to load campaign")).finally(() => setLoading(false));
  }, [isAuthorized, campaignId]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) return null;
  const emails = data?.emails ?? [];
  const metrics = emails.reduce((acc, e) => {
    if (e.status === "sent" || e.status === "replied") acc.sent++;
    if (e.status === "replied") acc.replied++;
    if (e.status === "bounced") acc.bounced++;
    if (e.status === "queued") acc.queued++;
    if (e.status === "failed") acc.failed++;
    if (e.status === "scheduled") acc.scheduled++;
    return acc;
  }, {
    sent: 0,
    replied: 0,
    bounced: 0,
    queued: 0,
    failed: 0,
    scheduled: 0
  });
  const campaignSc = data ? CAMPAIGN_STATUS_COLORS[data.campaign.status] ?? CAMPAIGN_STATUS_COLORS.draft : null;
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsx("button", {
        onClick: () => navigate("/outreach-orders"),
        className: "mb-6 inline-flex items-center gap-2 font-['Satoshi'] text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors",
        children: "← Back to Outreach Orders"
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex items-center justify-center py-20",
        children: /* @__PURE__ */ jsxs("div", {
          className: "text-center",
          children: [/* @__PURE__ */ jsx("div", {
            className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
          }), /* @__PURE__ */ jsx("p", {
            className: "font-['Satoshi'] text-sm text-gray-600",
            children: "Loading campaign..."
          })]
        })
      }) : data ? /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 16
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.4
        },
        className: "space-y-8",
        children: [/* @__PURE__ */ jsx("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: /* @__PURE__ */ jsxs("div", {
            className: "flex flex-col gap-2 md:flex-row md:items-center md:justify-between",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-3",
                children: [/* @__PURE__ */ jsx("h1", {
                  className: "font-['Clash_Display'] text-2xl font-medium text-neutral-950 md:text-3xl",
                  children: data.campaign.name
                }), campaignSc && /* @__PURE__ */ jsx("span", {
                  className: `inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${campaignSc.bg} ${campaignSc.text}`,
                  children: fmtStatus(data.campaign.status)
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
                children: ["Daily limit: ", data.campaign.daily_limit, " emails"]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3",
              children: [/* @__PURE__ */ jsx("div", {
                className: "font-['Satoshi'] text-sm font-medium text-neutral-900",
                children: data.owner.name
              }), /* @__PURE__ */ jsx("div", {
                className: "font-['Satoshi'] text-xs text-neutral-500",
                children: data.owner.email
              })]
            })]
          })
        }), /* @__PURE__ */ jsxs("div", {
          className: "grid grid-cols-3 gap-4 md:grid-cols-6",
          children: [/* @__PURE__ */ jsx(MetricPill, {
            label: "Sent",
            value: metrics.sent,
            color: "bg-green-50"
          }), /* @__PURE__ */ jsx(MetricPill, {
            label: "Replied",
            value: metrics.replied,
            color: "bg-emerald-50"
          }), /* @__PURE__ */ jsx(MetricPill, {
            label: "Bounced",
            value: metrics.bounced,
            color: "bg-red-50"
          }), /* @__PURE__ */ jsx(MetricPill, {
            label: "Queued",
            value: metrics.queued,
            color: "bg-neutral-50"
          }), /* @__PURE__ */ jsx(MetricPill, {
            label: "Scheduled",
            value: metrics.scheduled,
            color: "bg-blue-50"
          }), /* @__PURE__ */ jsx(MetricPill, {
            label: "Failed",
            value: metrics.failed,
            color: "bg-orange-50"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsxs("h2", {
            className: "mb-4 font-['Clash_Display'] text-xl font-medium text-neutral-950",
            children: ["All Emails (", emails.length, ")"]
          }), emails.length === 0 ? /* @__PURE__ */ jsx("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center",
            children: /* @__PURE__ */ jsx("p", {
              className: "font-['Satoshi'] text-sm text-neutral-500",
              children: "No emails yet for this campaign"
            })
          }) : /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full border-collapse",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "border-b-2 border-neutral-900 bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Lead"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Company"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Status"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Style"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Sent At"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950",
                    children: "Reply"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-4 py-3"
                  })]
                })
              }), /* @__PURE__ */ jsx("tbody", {
                children: emails.map((email) => /* @__PURE__ */ jsx(EmailRow, {
                  email
                }, email.id))
              })]
            })
          })]
        })]
      }) : /* @__PURE__ */ jsx("div", {
        className: "rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center",
        children: /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-neutral-500",
          children: "Campaign not found"
        })
      })]
    })]
  });
});
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: outreachCampaign
}, Symbol.toStringTag, { value: "Module" }));
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);
function meta$d({}) {
  return [{
    title: "Outreach – Admin Panel"
  }];
}
const STATUS_COLORS = {
  leads_generating: "bg-yellow-100 text-yellow-800 border border-yellow-300",
  leads_ready: "bg-blue-100 text-blue-800 border border-blue-300",
  enriching: "bg-orange-100 text-orange-800 border border-orange-300",
  enrichment_complete: "bg-teal-100 text-teal-800 border border-teal-300",
  campaign_setup: "bg-purple-100 text-purple-800 border border-purple-300",
  email_connected: "bg-indigo-100 text-indigo-800 border border-indigo-300",
  campaign_running: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  completed: "bg-neutral-100 text-neutral-700 border border-neutral-300"
};
function StatusBadge({
  status,
  stuck
}) {
  if (!status) return /* @__PURE__ */ jsx("span", {
    className: "font-['Satoshi'] text-xs text-neutral-400",
    children: "—"
  });
  const classes = STATUS_COLORS[status] || "bg-neutral-100 text-neutral-700 border border-neutral-300";
  return /* @__PURE__ */ jsxs("div", {
    className: "flex items-center gap-1.5",
    children: [/* @__PURE__ */ jsx("span", {
      className: `rounded-full px-2 py-0.5 font-['Satoshi'] text-xs font-semibold ${classes}`,
      children: status.replace(/_/g, " ")
    }), stuck && /* @__PURE__ */ jsx("span", {
      className: "rounded-full bg-red-500 px-2 py-0.5 font-['Satoshi'] text-xs font-bold text-white",
      children: "STUCK"
    })]
  });
}
const outreach = UNSAFE_withComponentProps(function Outreach() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [overview, setOverview] = useState(null);
  const [users2, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const limit = 50;
  useEffect(() => {
    if (!isAuthorized) return;
    setLoading(true);
    getOutreachOverview().then(setOverview).catch((e) => {
      setError(e.message || "Failed to load outreach stats");
      toast$1.error("Failed to load outreach overview");
    }).finally(() => setLoading(false));
  }, [isAuthorized]);
  const fetchUsers = async (off = 0, q = "", sf = "") => {
    setUsersLoading(true);
    try {
      const data = await listOutreachUsers(limit, off, q, sf);
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
    } catch (e) {
      toast$1.error(e.message || "Failed to load outreach users");
    } finally {
      setUsersLoading(false);
    }
  };
  useEffect(() => {
    if (!isAuthorized) return;
    fetchUsers(offset, search, statusFilter);
  }, [isAuthorized, offset, search, statusFilter]);
  if (isPending) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsx("div", {
        className: "h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500"
      })
    });
  }
  if (!isAuthorized) return null;
  const chartLabels = overview?.monthly_metrics.map((m) => m.month) || [];
  const emailsChart = {
    labels: chartLabels,
    datasets: [{
      label: "Emails Sent",
      data: overview?.monthly_metrics.map((m) => m.emails_sent) || [],
      backgroundColor: "rgba(124, 58, 237, 0.8)",
      borderColor: "rgba(124, 58, 237, 1)",
      borderWidth: 2,
      borderRadius: 6
    }, {
      label: "Replies",
      data: overview?.monthly_metrics.map((m) => m.emails_replied) || [],
      backgroundColor: "rgba(16, 185, 129, 0.8)",
      borderColor: "rgba(16, 185, 129, 1)",
      borderWidth: 2,
      borderRadius: 6
    }]
  };
  const ordersChart = {
    labels: chartLabels,
    datasets: [{
      label: "Orders Created",
      data: overview?.monthly_metrics.map((m) => m.orders_created) || [],
      backgroundColor: "rgba(245, 158, 11, 0.8)",
      borderColor: "rgba(245, 158, 11, 1)",
      borderWidth: 2,
      borderRadius: 6
    }]
  };
  const chartOptions2 = {
    responsive: true,
    plugins: {
      legend: {
        position: "top"
      },
      title: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };
  const fmtCents = (cents2) => {
    const inr2 = cents2 / 100;
    return inr2 >= 1e5 ? `₹${(inr2 / 1e5).toFixed(1)}L` : inr2 >= 1e3 ? `₹${(inr2 / 1e3).toFixed(1)}k` : `₹${inr2.toFixed(0)}`;
  };
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        className: "mb-8",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-4xl font-bold text-neutral-900 md:text-5xl",
          children: "Outreach"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-2 font-['Satoshi'] text-neutral-500",
          children: "Campaign overview across all users"
        })]
      }), error && /* @__PURE__ */ jsxs("div", {
        className: "mb-6 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 font-['Satoshi'] text-sm text-red-700",
        children: [error, " — make sure the outreach service is running."]
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex h-48 items-center justify-center",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500"
        })
      }) : overview && /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-8 grid grid-cols-2 gap-4 md:grid-cols-5",
          children: [{
            label: "Total Orders",
            value: overview.total_orders,
            color: "bg-violet-500"
          }, {
            label: "Active",
            value: overview.active_orders,
            color: "bg-amber-500"
          }, {
            label: "Completed",
            value: overview.completed_orders,
            color: "bg-emerald-500"
          }, {
            label: "Stuck",
            value: overview.stuck_orders,
            color: overview.stuck_orders > 0 ? "bg-red-500" : "bg-neutral-300"
          }, {
            label: "Revenue",
            value: fmtCents(overview.total_revenue_cents),
            color: "bg-teal-500"
          }].map((stat, i) => /* @__PURE__ */ jsxs(motion.div, {
            initial: {
              opacity: 0,
              y: 20
            },
            animate: {
              opacity: 1,
              y: 0
            },
            transition: {
              delay: i * 0.07
            },
            className: `rounded-2xl border-2 border-neutral-900 ${stat.color} p-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]`,
            children: [/* @__PURE__ */ jsx("div", {
              className: "font-['Clash_Display'] text-3xl font-bold text-white",
              children: stat.value
            }), /* @__PURE__ */ jsx("div", {
              className: "font-['Satoshi'] text-sm font-medium text-white/80",
              children: stat.label
            })]
          }, stat.label))
        }), /* @__PURE__ */ jsx("div", {
          className: "mb-8 grid grid-cols-2 gap-4 md:grid-cols-4",
          children: [{
            label: "Emails Sent",
            value: overview.total_emails_sent,
            color: "bg-blue-500"
          }, {
            label: "Replies",
            value: overview.total_emails_replied,
            color: "bg-pink-500"
          }, {
            label: "Bounced",
            value: overview.total_emails_bounced,
            color: "bg-orange-500"
          }, {
            label: "Reply Rate",
            value: `${overview.reply_rate_pct}%`,
            color: "bg-indigo-500"
          }].map((stat, i) => /* @__PURE__ */ jsxs(motion.div, {
            initial: {
              opacity: 0,
              y: 20
            },
            animate: {
              opacity: 1,
              y: 0
            },
            transition: {
              delay: 0.35 + i * 0.07
            },
            className: `rounded-2xl border-2 border-neutral-900 ${stat.color} p-5 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`,
            children: [/* @__PURE__ */ jsx("div", {
              className: "font-['Clash_Display'] text-3xl font-bold text-white",
              children: stat.value
            }), /* @__PURE__ */ jsx("div", {
              className: "font-['Satoshi'] text-sm font-medium text-white/80",
              children: stat.label
            })]
          }, stat.label))
        }), chartLabels.length > 0 && /* @__PURE__ */ jsxs("div", {
          className: "mb-8 grid gap-6 md:grid-cols-2",
          children: [/* @__PURE__ */ jsxs(motion.div, {
            initial: {
              opacity: 0,
              y: 20
            },
            animate: {
              opacity: 1,
              y: 0
            },
            transition: {
              delay: 0.5
            },
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "mb-4 font-['Clash_Display'] text-xl font-bold text-neutral-900",
              children: "Emails by Month"
            }), /* @__PURE__ */ jsx(Bar, {
              data: emailsChart,
              options: chartOptions2
            })]
          }), /* @__PURE__ */ jsxs(motion.div, {
            initial: {
              opacity: 0,
              y: 20
            },
            animate: {
              opacity: 1,
              y: 0
            },
            transition: {
              delay: 0.6
            },
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "mb-4 font-['Clash_Display'] text-xl font-bold text-neutral-900",
              children: "Orders by Month"
            }), /* @__PURE__ */ jsx(Bar, {
              data: ordersChart,
              options: chartOptions2
            })]
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "mb-4 flex flex-wrap items-center justify-between gap-3",
        children: [/* @__PURE__ */ jsx("h2", {
          className: "font-['Clash_Display'] text-2xl font-bold text-neutral-900",
          children: "Users"
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx("input", {
            type: "text",
            value: search,
            onChange: (e) => {
              setSearch(e.target.value);
              setOffset(0);
            },
            placeholder: "Search name / email...",
            className: "rounded-xl border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
          }), /* @__PURE__ */ jsxs("select", {
            value: statusFilter,
            onChange: (e) => {
              setStatusFilter(e.target.value);
              setOffset(0);
            },
            className: "rounded-xl border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400",
            children: [/* @__PURE__ */ jsx("option", {
              value: "",
              children: "All statuses"
            }), ["leads_generating", "leads_ready", "enriching", "enrichment_complete", "campaign_setup", "email_connected", "campaign_running", "completed"].map((s) => /* @__PURE__ */ jsx("option", {
              value: s,
              children: s.replace(/_/g, " ")
            }, s))]
          })]
        })]
      }), usersLoading ? /* @__PURE__ */ jsx("div", {
        className: "flex h-32 items-center justify-center",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-6 w-6 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500"
        })
      }) : users2.length === 0 ? /* @__PURE__ */ jsx("div", {
        className: "rounded-2xl border-2 border-neutral-200 bg-white p-12 text-center",
        children: /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-neutral-400",
          children: "No outreach users found."
        })
      }) : /* @__PURE__ */ jsx("div", {
        className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: /* @__PURE__ */ jsxs("table", {
          className: "w-full min-w-[900px]",
          children: [/* @__PURE__ */ jsx("thead", {
            children: /* @__PURE__ */ jsx("tr", {
              className: "border-b-2 border-neutral-900 bg-neutral-50",
              children: ["User", "Orders", "Status", "Credits", "Sent", "Replied", "Leads", "Spent"].map((h) => /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                children: h
              }, h))
            })
          }), /* @__PURE__ */ jsx("tbody", {
            children: users2.map((u, i) => /* @__PURE__ */ jsxs(motion.tr, {
              initial: {
                opacity: 0
              },
              animate: {
                opacity: 1
              },
              transition: {
                delay: i * 0.02
              },
              className: "border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50",
              children: [/* @__PURE__ */ jsxs("td", {
                className: "px-4 py-3",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "font-['Satoshi'] text-sm font-semibold text-neutral-900",
                  children: u.user_name
                }), /* @__PURE__ */ jsx("div", {
                  className: "font-['Satoshi'] text-xs text-neutral-400",
                  children: u.user_email
                })]
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                children: u.total_orders
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: /* @__PURE__ */ jsx(StatusBadge, {
                  status: u.active_order_status,
                  stuck: u.is_stuck
                })
              }), /* @__PURE__ */ jsxs("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                children: [u.used_credits, "/", u.total_credits]
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                children: u.total_emails_sent
              }), /* @__PURE__ */ jsxs("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                children: [u.total_emails_replied, u.total_emails_sent > 0 && /* @__PURE__ */ jsxs("span", {
                  className: "ml-1 text-xs text-neutral-400",
                  children: ["(", (u.total_emails_replied / u.total_emails_sent * 100).toFixed(0), "%)"]
                })]
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                children: u.total_leads
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-700",
                children: fmtCents(u.total_paid_cents)
              })]
            }, u.user_id))
          })]
        })
      }), usersTotal > limit && /* @__PURE__ */ jsxs("div", {
        className: "mt-4 flex items-center justify-between",
        children: [/* @__PURE__ */ jsxs("p", {
          className: "font-['Satoshi'] text-sm text-neutral-500",
          children: ["Showing ", offset + 1, "–", Math.min(offset + limit, usersTotal), " of ", usersTotal]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(Math.max(0, offset - limit)),
            disabled: offset === 0,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
            children: "Previous"
          }), /* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(offset + limit),
            disabled: offset + limit >= usersTotal,
            className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
            children: "Next"
          })]
        })]
      })]
    })]
  });
});
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: outreach,
  meta: meta$d
}, Symbol.toStringTag, { value: "Module" }));
function meta$c({}) {
  return [{
    title: "Careers – Admin Panel"
  }, {
    name: "description",
    content: "Manage career applications"
  }];
}
const careers = UNSAFE_withComponentProps(function Careers() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  useEffect(() => {
    if (isAuthorized) {
      loadApplications();
    }
  }, [offset, isAuthorized]);
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) {
    return null;
  }
  const loadApplications = async () => {
    try {
      setLoading(true);
      const applicationsList = await listCareers(limit, offset);
      setApplications(Array.isArray(applicationsList) ? applicationsList : []);
    } catch (error) {
      toast$1.error(error.message || "Failed to load applications");
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };
  const formatAmount2 = (paise) => {
    return `₹${(paise / 100).toLocaleString("en-IN")}`;
  };
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl",
        children: "Career Applications"
      }), loading ? /* @__PURE__ */ jsx("p", {
        className: "mt-4 font-['Satoshi'] text-base text-gray-600",
        children: "Loading..."
      }) : /* @__PURE__ */ jsxs("div", {
        className: "mt-8 overflow-x-auto",
        children: [/* @__PURE__ */ jsxs("table", {
          className: "w-full border-collapse",
          children: [/* @__PURE__ */ jsx("thead", {
            children: /* @__PURE__ */ jsxs("tr", {
              className: "border-b-2 border-neutral-900",
              children: [/* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Name"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Email"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Institution"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Course"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Interests"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Payment"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Status"
              }), /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950",
                children: "Created"
              })]
            })
          }), /* @__PURE__ */ jsx("tbody", {
            children: applications && applications.length > 0 ? applications.map((app) => /* @__PURE__ */ jsxs("tr", {
              className: "border-b border-gray-200",
              children: [/* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: app.name
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: app.email
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: app.institution_name
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-neutral-950",
                children: app.course
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-950",
                children: Array.isArray(app.areas_of_interest) ? app.areas_of_interest.join(", ") : "-"
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: /* @__PURE__ */ jsxs("span", {
                  className: `rounded px-2 py-1 font-['Satoshi'] text-xs ${app.payment_status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`,
                  children: [app.payment_status, " (", formatAmount2(app.amount), ")"]
                })
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: /* @__PURE__ */ jsx("span", {
                  className: "rounded bg-gray-100 px-2 py-1 font-['Satoshi'] text-xs text-gray-700",
                  children: app.status
                })
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 font-['Satoshi'] text-sm text-gray-600",
                children: new Date(app.created_at).toLocaleDateString()
              })]
            }, app.id)) : /* @__PURE__ */ jsx("tr", {
              children: /* @__PURE__ */ jsx("td", {
                colSpan: 8,
                className: "px-4 py-8 text-center font-['Satoshi'] text-sm text-gray-500",
                children: "No applications found"
              })
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "mt-4 flex gap-4",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(Math.max(0, offset - limit)),
            disabled: offset === 0,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50",
            children: "Previous"
          }), /* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(offset + limit),
            disabled: applications.length < limit,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50",
            children: "Next"
          })]
        })]
      })]
    })]
  });
});
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: careers,
  meta: meta$c
}, Symbol.toStringTag, { value: "Module" }));
function meta$b({}) {
  return [{
    title: "Settings – Admin Panel"
  }, {
    name: "description",
    content: "Platform configuration and API keys"
  }];
}
const SETTINGS = [{
  key: "n8n_blog_api_key",
  label: "n8n Blog API Key",
  description: "Secret key used by n8n to publish blog posts via POST /api/blog/n8n on Maverick. Send this as the X-API-Key header.",
  placeholder: "Enter a strong random secret...",
  group: "Integrations"
}];
const GROUPS = [...new Set(SETTINGS.map((s) => s.group))];
function KeyIcon() {
  return /* @__PURE__ */ jsx("svg", {
    className: "w-4 h-4",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    children: /* @__PURE__ */ jsx("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      d: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
    })
  });
}
function CheckIcon() {
  return /* @__PURE__ */ jsx("svg", {
    className: "w-4 h-4",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    children: /* @__PURE__ */ jsx("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      d: "M5 13l4 4L19 7"
    })
  });
}
function TrashIcon() {
  return /* @__PURE__ */ jsx("svg", {
    className: "w-4 h-4",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    children: /* @__PURE__ */ jsx("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    })
  });
}
const settings = UNSAFE_withComponentProps(function Settings() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  useEffect(() => {
    if (isAuthorized) loadSettings();
  }, [isAuthorized]);
  const loadSettings = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const keys = SETTINGS.map((s) => s.key).join(",");
      const res = await fetch(`/api/settings?keys=${keys}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        const initial = {};
        for (const s of SETTINGS) {
          initial[s.key] = "";
        }
        setSaved(Object.fromEntries(Object.entries(data.settings).map(([k, v]) => [k, !!v])));
        setValues(initial);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async (key) => {
    const value = values[key]?.trim();
    if (!value) {
      toast$1.error("Enter a value before saving");
      return;
    }
    setSaving((p) => ({
      ...p,
      [key]: true
    }));
    try {
      const token = await getToken();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          key,
          value
        })
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved((p) => ({
        ...p,
        [key]: true
      }));
      setValues((p) => ({
        ...p,
        [key]: ""
      }));
      toast$1.success("Saved successfully");
    } catch {
      toast$1.error("Failed to save setting");
    } finally {
      setSaving((p) => ({
        ...p,
        [key]: false
      }));
    }
  };
  const handleDelete = async (key) => {
    if (!confirm("Remove this key? Any integration using it will stop working.")) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          key
        })
      });
      if (!res.ok) throw new Error("Failed to delete");
      setSaved((p) => ({
        ...p,
        [key]: false
      }));
      setValues((p) => ({
        ...p,
        [key]: ""
      }));
      toast$1.success("Key removed");
    } catch {
      toast$1.error("Failed to remove key");
    }
  };
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-gray-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-3xl px-4 py-10 md:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-8",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-3xl font-bold text-neutral-900",
          children: "Settings"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
          children: "Platform configuration and integration keys."
        })]
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "flex items-center justify-center py-20",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-7 w-7 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        })
      }) : /* @__PURE__ */ jsx("div", {
        className: "space-y-8",
        children: GROUPS.map((group) => /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h2", {
            className: "mb-4 font-['Clash_Display'] text-lg font-bold text-neutral-900 border-b-2 border-neutral-900 pb-2",
            children: group
          }), /* @__PURE__ */ jsx("div", {
            className: "space-y-4",
            children: SETTINGS.filter((s) => s.group === group).map((setting) => /* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border-2 border-neutral-900 bg-white p-6 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex items-start justify-between gap-4 mb-3",
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsxs("div", {
                    className: "flex items-center gap-2",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: "font-['Satoshi'] text-sm font-semibold text-neutral-900",
                      children: setting.label
                    }), saved[setting.key] && /* @__PURE__ */ jsxs("span", {
                      className: "inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-semibold text-emerald-700",
                      children: [/* @__PURE__ */ jsx(CheckIcon, {}), " Set"]
                    })]
                  }), /* @__PURE__ */ jsx("p", {
                    className: "mt-1 font-['Satoshi'] text-xs text-neutral-500 max-w-md",
                    children: setting.description
                  }), /* @__PURE__ */ jsxs("p", {
                    className: "mt-1 font-mono text-xs text-neutral-400",
                    children: ["key: ", setting.key]
                  })]
                }), saved[setting.key] && /* @__PURE__ */ jsxs("button", {
                  onClick: () => handleDelete(setting.key),
                  className: "flex-shrink-0 flex items-center gap-1 rounded-lg border-2 border-neutral-200 bg-white px-3 py-1.5 text-xs font-['Satoshi'] font-medium text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors",
                  children: [/* @__PURE__ */ jsx(TrashIcon, {}), " Remove"]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex gap-2",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "relative flex-1",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400",
                    children: /* @__PURE__ */ jsx(KeyIcon, {})
                  }), /* @__PURE__ */ jsx("input", {
                    type: "password",
                    value: values[setting.key] || "",
                    onChange: (e) => setValues((p) => ({
                      ...p,
                      [setting.key]: e.target.value
                    })),
                    onKeyDown: (e) => e.key === "Enter" && handleSave(setting.key),
                    placeholder: saved[setting.key] ? "Enter new value to replace..." : setting.placeholder,
                    className: "w-full h-10 pl-9 pr-4 rounded-lg border-2 border-neutral-900 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
                  })]
                }), /* @__PURE__ */ jsx("button", {
                  onClick: () => handleSave(setting.key),
                  disabled: saving[setting.key] || !values[setting.key]?.trim(),
                  className: "flex-shrink-0 h-10 px-5 rounded-lg bg-violet-600 text-white font-['Satoshi'] font-semibold text-sm border-2 border-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
                  children: saving[setting.key] ? "Saving..." : saved[setting.key] ? "Update" : "Save"
                })]
              })]
            }, setting.key))
          })]
        }, group))
      })]
    })]
  });
});
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: settings,
  meta: meta$b
}, Symbol.toStringTag, { value: "Module" }));
async function ensureTable$2() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
async function loader$b({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  await ensureTable$2();
  const url = new URL(request.url);
  const keys = url.searchParams.get("keys")?.split(",").map((k) => k.trim()).filter(Boolean);
  if (!keys || keys.length === 0) {
    const result2 = await db.execute(sql`SELECT key, value, updated_at FROM platform_settings ORDER BY key`);
    return Response.json({
      settings: result2.rows
    });
  }
  const result = await db.execute(sql`SELECT key, value, updated_at FROM platform_settings WHERE key = ANY(${keys})`);
  const map = {};
  for (const row of result.rows) {
    map[row.key] = row.value ? "••••••••" : "";
  }
  return Response.json({
    settings: map
  });
}
async function action$7({
  request
}) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  await ensureTable$2();
  if (request.method === "DELETE") {
    const {
      key: key2
    } = await request.json();
    if (!key2) return Response.json({
      error: "key required"
    }, {
      status: 400
    });
    await db.execute(sql`DELETE FROM platform_settings WHERE key = ${key2}`);
    return Response.json({
      success: true
    });
  }
  const {
    key,
    value
  } = await request.json();
  if (!key || !value) return Response.json({
    error: "key and value required"
  }, {
    status: 400
  });
  await db.execute(sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `);
  return Response.json({
    success: true
  });
}
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
function meta$a({}) {
  return [{
    title: "Email Sequences – Admin Panel"
  }, {
    name: "description",
    content: "Manage nurture email sequences"
  }];
}
const EMAIL_TYPE_LABELS = {
  // System
  welcome: "Welcome",
  "forgot-password": "Forgot password",
  "resume-optimized": "Resume optimized",
  "internship-applied": "Internship applied",
  "password-changed": "Password changed",
  // Legacy nurture
  nurture_day3: "Day 3 — Applying the wrong way",
  nurture_day7: "Day 7 — Still looking?",
  nurture_day14: "Day 14 — Social proof",
  nurture_day30: "Day 30 — Personal check-in",
  // Funnel — Email 01 Welcome
  "event.funnel.welcome_new": "01A — Welcome (new user)",
  "event.funnel.welcome_existing": "01B — Welcome (existing user)",
  // Funnel — Email 02 Follow-up
  "event.funnel.followup_v1": "02 V1 — Follow-up (Personal Nudge)",
  "event.funnel.followup_v2": "02 V2 — Follow-up (Curiosity Hook)",
  "event.funnel.followup_v3": "02 V3 — Follow-up (Blunt One)",
  // Funnel — Email 03 Segmentation
  "event.funnel.segmentation_v1": "03 V1 — Segmentation (Clean Direct)",
  "event.funnel.segmentation_v2": "03 V2 — Segmentation (Story Led)",
  // Funnel — Email 04 Exploration
  "event.funnel.exploration_v1": "04 V1 — Exploration (The Guide)",
  "event.funnel.exploration_v2": "04 V2 — Exploration (The Challenge)",
  // Funnel — Email 05–06
  "event.funnel.congratulations": "05 — Congratulations",
  "event.funnel.comparison": "06 — Comparison",
  // Funnel — Email 07 Pitching
  "event.funnel.pitching_v1": "07 V1 — Pitching (Stat Led)",
  "event.funnel.pitching_v2": "07 V2 — Pitching (Problem First)",
  "event.funnel.pitching_v3": "07 V3 — Pitching (Soft Sell)",
  // Funnel — Email 08 Honest Question
  "event.funnel.honest_question_v1": "08 V1 — Honest Question (Direct Ask)",
  "event.funnel.honest_question_v2": "08 V2 — Honest Question (Empathy)",
  "event.funnel.honest_question_v3": "08 V3 — Honest Question (Exit Ramp)",
  // Funnel — Email 09–10
  "event.funnel.onboarding": "09 — Onboarding (Paywall)",
  "event.funnel.recognition_v1": "10 V1 — Recognition (Strong Progress)",
  "event.funnel.recognition_v2": "10 V2 — Recognition (Encouraging Start)",
  "event.funnel.recognition_v3": "10 V3 — Recognition (Slow Progress / Anti-Churn)",
  "event.funnel.recognition_v4": "10 V4 — Recognition (Milestone Unlocked)",
  // Funnel — Emails 11–16
  "event.funnel.testimonial": "11 — Testimonial (Social Proof)",
  "event.funnel.pricing": "12 — Pricing (Post-Upgrade)",
  "event.funnel.case_study": "13 — Case Study (Re-engaged)",
  "event.funnel.walkthrough": "14 — Walkthrough (No Reply)",
  "event.funnel.educational": "15 — Educational (Not Converting)",
  "event.funnel.winback": "16 — Win-back (Final)"
};
const BULK_TYPE_LABELS = {
  // System
  welcome: "Welcome",
  // Legacy nurture
  nurture_day3: "Day 3 — Applying the wrong way",
  nurture_day7: "Day 7 — Still looking?",
  nurture_day14: "Day 14 — Social proof",
  nurture_day30: "Day 30 — Personal check-in",
  // Funnel
  "event.funnel.welcome_new": "01A — Welcome (new user)",
  "event.funnel.welcome_existing": "01B — Welcome (existing user)",
  "event.funnel.followup_v1": "02 V1 — Follow-up (Personal Nudge)",
  "event.funnel.followup_v2": "02 V2 — Follow-up (Curiosity Hook)",
  "event.funnel.followup_v3": "02 V3 — Follow-up (Blunt One)",
  "event.funnel.segmentation_v1": "03 V1 — Segmentation (Clean Direct)",
  "event.funnel.segmentation_v2": "03 V2 — Segmentation (Story Led)",
  "event.funnel.exploration_v1": "04 V1 — Exploration (The Guide)",
  "event.funnel.exploration_v2": "04 V2 — Exploration (The Challenge)",
  "event.funnel.congratulations": "05 — Congratulations",
  "event.funnel.comparison": "06 — Comparison",
  "event.funnel.pitching_v1": "07 V1 — Pitching (Stat Led)",
  "event.funnel.pitching_v2": "07 V2 — Pitching (Problem First)",
  "event.funnel.pitching_v3": "07 V3 — Pitching (Soft Sell)",
  "event.funnel.honest_question_v1": "08 V1 — Honest Question (Direct Ask)",
  "event.funnel.honest_question_v2": "08 V2 — Honest Question (Empathy)",
  "event.funnel.honest_question_v3": "08 V3 — Honest Question (Exit Ramp)",
  "event.funnel.onboarding": "09 — Onboarding (Paywall)",
  "event.funnel.recognition_v1": "10 V1 — Recognition (Strong Progress)",
  "event.funnel.recognition_v2": "10 V2 — Recognition (Encouraging Start)",
  "event.funnel.recognition_v3": "10 V3 — Recognition (Slow Progress / Anti-Churn)",
  "event.funnel.recognition_v4": "10 V4 — Recognition (Milestone Unlocked)",
  "event.funnel.testimonial": "11 — Testimonial (Social Proof)",
  "event.funnel.pricing": "12 — Pricing (Post-Upgrade)",
  "event.funnel.case_study": "13 — Case Study (Re-engaged)",
  "event.funnel.walkthrough": "14 — Walkthrough (No Reply)",
  "event.funnel.educational": "15 — Educational (Not Converting)",
  "event.funnel.winback": "16 — Win-back (Final)"
};
const DAYS_OPTIONS = [{
  label: "All users",
  value: 0
}, {
  label: "Last 24 hours",
  value: 1
}, {
  label: "Last 3 days",
  value: 3
}, {
  label: "Last 7 days",
  value: 7
}, {
  label: "Last 14 days",
  value: 14
}, {
  label: "Last 30 days",
  value: 30
}, {
  label: "Last 60 days",
  value: 60
}, {
  label: "Last 90 days",
  value: 90
}];
const STATUS_FILTERS$2 = [{
  label: "Pending",
  value: "pending"
}, {
  label: "Due now",
  value: "due"
}, {
  label: "Sent",
  value: "sent"
}, {
  label: "All",
  value: ""
}];
function formatDate(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function relativeTo(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 6e4);
  const hours = Math.floor(abs / 36e5);
  const days = Math.floor(abs / 864e5);
  const label = days >= 1 ? `${days}d` : hours >= 1 ? `${hours}h` : mins >= 1 ? `${mins}m` : "now";
  return ms < 0 ? `${label} ago` : `in ${label}`;
}
const emailSequences = UNSAFE_withComponentProps(function EmailSequences() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [emails, setEmails] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerRouting, setTriggerRouting] = useState("event.user.signup");
  const [triggerUserID, setTriggerUserID] = useState("");
  const [triggerEmail2, setTriggerEmail2] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchRef = useRef(null);
  const dropdownRef = useRef(null);
  const load = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setLoading(true);
      const data = await listScheduledEmails(status, limit, offset);
      setEmails(data.emails ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      toast$1.error(err.message || "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, status, offset]);
  useEffect(() => {
    load();
  }, [load]);
  const handleCancel = async (id, userEmail) => {
    if (!confirm(`Cancel scheduled email for ${userEmail}?`)) return;
    try {
      setCancelling(id);
      await cancelScheduledEmail(id);
      toast$1.success("Email cancelled");
      setEmails((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
    } catch (err) {
      toast$1.error(err.message || "Failed to cancel email");
    } finally {
      setCancelling(null);
    }
  };
  const handleUserSearch = (q) => {
    setUserQuery(q);
    setShowUserDropdown(true);
    if (userSearchRef.current) clearTimeout(userSearchRef.current);
    if (!q.trim()) {
      setUserResults([]);
      return;
    }
    userSearchRef.current = setTimeout(async () => {
      try {
        setUserSearching(true);
        const res = await listUsers(8, 0, q.trim());
        setUserResults(res.users);
      } catch {
        setUserResults([]);
      } finally {
        setUserSearching(false);
      }
    }, 300);
  };
  const selectUser = (u) => {
    setTriggerUserID(u.id);
    setTriggerEmail2(u.email);
    setTriggerName(u.name || u.full_name || "");
    setUserQuery(`${u.name || u.email} (${u.email})`);
    setShowUserDropdown(false);
    setUserResults([]);
  };
  const handleTrigger = async () => {
    if (!triggerUserID.trim()) {
      toast$1.error("User ID is required");
      return;
    }
    try {
      setTriggering(true);
      let event = {
        user_id: triggerUserID.trim()
      };
      if (triggerRouting === "event.user.signup") {
        if (!triggerEmail2.trim()) {
          toast$1.error("Email is required for signup event");
          return;
        }
        event = {
          user_id: triggerUserID.trim(),
          email: triggerEmail2.trim(),
          name: triggerName.trim() || "User"
        };
      }
      await triggerEmail(triggerRouting, event);
      toast$1.success("Email triggered successfully");
      setTriggerOpen(false);
      setTriggerUserID("");
      setTriggerEmail2("");
      setTriggerName("");
      setUserQuery("");
      setTimeout(load, 1500);
    } catch (err) {
      toast$1.error(err.message || "Failed to trigger email");
    } finally {
      setTriggering(false);
    }
  };
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkType, setBulkType] = useState("welcome");
  const [bulkDays, setBulkDays] = useState(0);
  const [bulkPreviewCount, setBulkPreviewCount] = useState(null);
  const [bulkPreviewing, setBulkPreviewing] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const handleBulkPreview = async () => {
    try {
      setBulkPreviewing(true);
      const res = await bulkSendPreview(bulkDays);
      setBulkPreviewCount(res.count);
    } catch (err) {
      toast$1.error(err.message || "Failed to preview");
    } finally {
      setBulkPreviewing(false);
    }
  };
  const handleBulkSend = async () => {
    if (bulkPreviewCount === null || bulkPreviewCount === 0) {
      toast$1.error("No users to send to");
      return;
    }
    if (!confirm(`Send "${BULK_TYPE_LABELS[bulkType] || bulkType}" to ${bulkPreviewCount} user${bulkPreviewCount !== 1 ? "s" : ""}?`)) return;
    try {
      setBulkSending(true);
      const res = await bulkSend(bulkType, bulkDays);
      toast$1.success(res.message || `Sending to ${res.total} users`);
      setBulkOpen(false);
      setBulkPreviewCount(null);
      setTimeout(load, 2e3);
    } catch (err) {
      toast$1.error(err.message || "Failed to send");
    } finally {
      setBulkSending(false);
    }
  };
  const filtered = search.trim() ? emails.filter((e) => e.user_email.toLowerCase().includes(search.toLowerCase()) || e.user_name.toLowerCase().includes(search.toLowerCase()) || e.email_type.toLowerCase().includes(search.toLowerCase())) : emails;
  if (isPending || isAuthorized === null) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center",
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
        }), /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-sm text-gray-600",
          children: "Loading..."
        })]
      })
    });
  }
  if (!isAuthorized) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-gray-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 md:px-8",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.4
        },
        className: "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Satoshi'] text-3xl font-black text-neutral-900",
            children: "Email Sequences"
          }), /* @__PURE__ */ jsxs("p", {
            className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
            children: [total, " email", total !== 1 ? "s" : "", " — ", status || "all", " view"]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => {
              setTriggerOpen((v) => !v);
              setBulkOpen(false);
            },
            className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: "+ Trigger Email"
          }), /* @__PURE__ */ jsx("button", {
            onClick: () => {
              setBulkOpen((v) => !v);
              setTriggerOpen(false);
              setBulkPreviewCount(null);
            },
            className: "rounded-lg border-2 border-neutral-900 bg-amber-500 px-4 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: "Bulk Send"
          })]
        }), /* @__PURE__ */ jsx("div", {
          className: "flex gap-2 flex-wrap",
          children: STATUS_FILTERS$2.map((f) => /* @__PURE__ */ jsx("button", {
            onClick: () => {
              setStatus(f.value);
              setOffset(0);
            },
            className: `rounded-lg border-2 border-neutral-900 px-4 py-1.5 font-['Satoshi'] text-sm font-medium transition-all ${status === f.value ? "bg-violet-500 text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]" : "bg-white text-neutral-700 hover:bg-neutral-50 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"}`,
            children: f.label
          }, f.value))
        })]
      }), /* @__PURE__ */ jsx(AnimatePresence, {
        children: triggerOpen && /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: -8
          },
          animate: {
            opacity: 1,
            y: 0
          },
          exit: {
            opacity: 0,
            y: -8
          },
          transition: {
            duration: 0.2
          },
          className: "mb-6 rounded-xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("h2", {
            className: "mb-4 font-['Satoshi'] text-lg font-bold text-neutral-900",
            children: "Trigger Email"
          }), /* @__PURE__ */ jsxs("div", {
            className: "grid gap-4 sm:grid-cols-2",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                className: "mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600",
                children: "Email type"
              }), /* @__PURE__ */ jsxs("select", {
                value: triggerRouting,
                onChange: (e) => setTriggerRouting(e.target.value),
                className: "w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400",
                children: [/* @__PURE__ */ jsxs("optgroup", {
                  label: "System",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.user.signup",
                    children: "Welcome (signup)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.resume.optimized",
                    children: "Resume optimized"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.internship.applied",
                    children: "Internship applied"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "01 — Welcome",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.welcome_new",
                    children: "01A — Welcome (new user)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.welcome_existing",
                    children: "01B — Welcome (existing user)"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "02 — Follow-up",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.followup_v1",
                    children: "02 V1 — Personal Nudge"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.followup_v2",
                    children: "02 V2 — Curiosity Hook"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.followup_v3",
                    children: "02 V3 — Blunt One"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "03 — Segmentation",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.segmentation_v1",
                    children: "03 V1 — Clean Direct"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.segmentation_v2",
                    children: "03 V2 — Story Led"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "04 — Exploration",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.exploration_v1",
                    children: "04 V1 — The Guide"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.exploration_v2",
                    children: "04 V2 — The Challenge"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "05–06",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.congratulations",
                    children: "05 — Congratulations"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.comparison",
                    children: "06 — Comparison"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "07 — Pitching",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.pitching_v1",
                    children: "07 V1 — Stat Led"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.pitching_v2",
                    children: "07 V2 — Problem First"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.pitching_v3",
                    children: "07 V3 — Soft Sell"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "08 — Honest Question",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.honest_question_v1",
                    children: "08 V1 — Direct Ask"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.honest_question_v2",
                    children: "08 V2 — Empathy"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.honest_question_v3",
                    children: "08 V3 — Exit Ramp"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "09–10",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.onboarding",
                    children: "09 — Onboarding (Paywall)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.recognition_v1",
                    children: "10 V1 — Recognition (Strong Progress)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.recognition_v2",
                    children: "10 V2 — Recognition (Encouraging Start)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.recognition_v3",
                    children: "10 V3 — Recognition (Slow Progress)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.recognition_v4",
                    children: "10 V4 — Recognition (Milestone Unlocked)"
                  })]
                }), /* @__PURE__ */ jsxs("optgroup", {
                  label: "11–16 — New",
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "event.funnel.testimonial",
                    children: "11 — Testimonial (Social Proof)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.pricing",
                    children: "12 — Pricing (Post-Upgrade)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.case_study",
                    children: "13 — Case Study (Re-engaged)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.walkthrough",
                    children: "14 — Walkthrough (No Reply)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.educational",
                    children: "15 — Educational (Not Converting)"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "event.funnel.winback",
                    children: "16 — Win-back (Final)"
                  })]
                })]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "relative sm:col-span-2",
              ref: dropdownRef,
              children: [/* @__PURE__ */ jsx("label", {
                className: "mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600",
                children: "Search user"
              }), /* @__PURE__ */ jsx("input", {
                type: "text",
                placeholder: "Type name or email…",
                value: userQuery,
                onChange: (e) => handleUserSearch(e.target.value),
                onFocus: () => userQuery && setShowUserDropdown(true),
                className: "w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm placeholder:text-neutral-400 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
              }), triggerUserID && /* @__PURE__ */ jsxs("div", {
                className: "mt-1.5 flex items-center gap-2",
                children: [/* @__PURE__ */ jsxs("span", {
                  className: "inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-['Satoshi'] text-xs text-violet-700",
                  children: [/* @__PURE__ */ jsx("span", {
                    className: "h-1.5 w-1.5 rounded-full bg-violet-500"
                  }), triggerEmail2, " · ID: ", triggerUserID.slice(0, 8), "…"]
                }), /* @__PURE__ */ jsx("button", {
                  onClick: () => {
                    setTriggerUserID("");
                    setTriggerEmail2("");
                    setTriggerName("");
                    setUserQuery("");
                  },
                  className: "font-['Satoshi'] text-xs text-neutral-400 hover:text-red-500",
                  children: "✕"
                })]
              }), /* @__PURE__ */ jsx(AnimatePresence, {
                children: showUserDropdown && (userResults.length > 0 || userSearching) && /* @__PURE__ */ jsx(motion.div, {
                  initial: {
                    opacity: 0,
                    y: -4
                  },
                  animate: {
                    opacity: 1,
                    y: 0
                  },
                  exit: {
                    opacity: 0,
                    y: -4
                  },
                  transition: {
                    duration: 0.15
                  },
                  className: "absolute z-50 mt-1 w-full rounded-lg border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
                  children: userSearching ? /* @__PURE__ */ jsx("div", {
                    className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-400",
                    children: "Searching…"
                  }) : userResults.map((u) => /* @__PURE__ */ jsxs("button", {
                    onMouseDown: () => selectUser(u),
                    className: "flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-violet-50 first:rounded-t-lg last:rounded-b-lg",
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 font-['Satoshi'] text-xs font-bold text-violet-700",
                      children: (u.name || u.email || "?")[0].toUpperCase()
                    }), /* @__PURE__ */ jsxs("div", {
                      children: [/* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-sm font-medium text-neutral-900",
                        children: u.name || u.full_name || "—"
                      }), /* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-xs text-neutral-400",
                        children: u.email
                      })]
                    })]
                  }, u.id))
                })
              })]
            }), triggerRouting === "event.user.signup" && /* @__PURE__ */ jsxs(Fragment, {
              children: [/* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  className: "mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600",
                  children: "Email address"
                }), /* @__PURE__ */ jsx("input", {
                  type: "email",
                  placeholder: "user@example.com",
                  value: triggerEmail2,
                  onChange: (e) => setTriggerEmail2(e.target.value),
                  className: "w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm placeholder:text-neutral-400 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsx("label", {
                  className: "mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600",
                  children: "Name"
                }), /* @__PURE__ */ jsx("input", {
                  type: "text",
                  placeholder: "Jeremy",
                  value: triggerName,
                  onChange: (e) => setTriggerName(e.target.value),
                  className: "w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm placeholder:text-neutral-400 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                })]
              })]
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "mt-4 flex gap-3",
            children: [/* @__PURE__ */ jsx("button", {
              onClick: handleTrigger,
              disabled: triggering,
              className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-5 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50",
              children: triggering ? "Sending…" : "Send now"
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => setTriggerOpen(false),
              className: "rounded-lg border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-medium text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50",
              children: "Cancel"
            })]
          })]
        })
      }), /* @__PURE__ */ jsx(AnimatePresence, {
        children: bulkOpen && /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: -8
          },
          animate: {
            opacity: 1,
            y: 0
          },
          exit: {
            opacity: 0,
            y: -8
          },
          transition: {
            duration: 0.2
          },
          className: "mb-6 rounded-xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("h2", {
            className: "mb-4 font-['Satoshi'] text-lg font-bold text-neutral-900",
            children: "Bulk Send Email"
          }), /* @__PURE__ */ jsxs("div", {
            className: "grid gap-4 sm:grid-cols-2",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                className: "mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600",
                children: "Email type"
              }), /* @__PURE__ */ jsx("select", {
                value: bulkType,
                onChange: (e) => {
                  setBulkType(e.target.value);
                  setBulkPreviewCount(null);
                },
                className: "w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400",
                children: Object.entries(BULK_TYPE_LABELS).map(([value, label]) => /* @__PURE__ */ jsx("option", {
                  value,
                  children: label
                }, value))
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("label", {
                className: "mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600",
                children: "Users signed up"
              }), /* @__PURE__ */ jsx("select", {
                value: bulkDays,
                onChange: (e) => {
                  setBulkDays(Number(e.target.value));
                  setBulkPreviewCount(null);
                },
                className: "w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400",
                children: DAYS_OPTIONS.map((opt) => /* @__PURE__ */ jsx("option", {
                  value: opt.value,
                  children: opt.label
                }, opt.value))
              })]
            })]
          }), bulkPreviewCount !== null && /* @__PURE__ */ jsx(motion.div, {
            initial: {
              opacity: 0
            },
            animate: {
              opacity: 1
            },
            className: "mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3",
            children: /* @__PURE__ */ jsxs("p", {
              className: "font-['Satoshi'] text-sm text-amber-900",
              children: [/* @__PURE__ */ jsx("span", {
                className: "font-bold",
                children: bulkPreviewCount
              }), " user", bulkPreviewCount !== 1 ? "s" : "", " will receive", " ", /* @__PURE__ */ jsx("span", {
                className: "font-bold",
                children: BULK_TYPE_LABELS[bulkType] || bulkType
              })]
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "mt-4 flex gap-3",
            children: [/* @__PURE__ */ jsx("button", {
              onClick: handleBulkPreview,
              disabled: bulkPreviewing,
              className: "rounded-lg border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-medium text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 disabled:opacity-50",
              children: bulkPreviewing ? "Counting..." : "Preview count"
            }), /* @__PURE__ */ jsx("button", {
              onClick: handleBulkSend,
              disabled: bulkSending || bulkPreviewCount === null || bulkPreviewCount === 0,
              className: "rounded-lg border-2 border-neutral-900 bg-amber-500 px-5 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50",
              children: bulkSending ? "Sending..." : "Send to all"
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => {
                setBulkOpen(false);
                setBulkPreviewCount(null);
              },
              className: "rounded-lg border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-medium text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50",
              children: "Cancel"
            })]
          })]
        })
      }), /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 10
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.4,
          delay: 0.1
        },
        className: "mb-6",
        children: /* @__PURE__ */ jsx("input", {
          type: "text",
          placeholder: "Search by user email, name, or email type…",
          value: search,
          onChange: (e) => setSearch(e.target.value),
          className: "w-full max-w-md rounded-lg border-2 border-neutral-900 bg-white px-4 py-2.5 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
        })
      }), /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.4,
          delay: 0.15
        },
        className: "overflow-hidden rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: loading ? /* @__PURE__ */ jsx("div", {
          className: "flex items-center justify-center py-20",
          children: /* @__PURE__ */ jsx("div", {
            className: "h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"
          })
        }) : filtered.length === 0 ? /* @__PURE__ */ jsx("div", {
          className: "py-20 text-center font-['Satoshi'] text-neutral-500",
          children: "No emails found."
        }) : /* @__PURE__ */ jsx("div", {
          className: "overflow-x-auto",
          children: /* @__PURE__ */ jsxs("table", {
            className: "w-full",
            children: [/* @__PURE__ */ jsx("thead", {
              children: /* @__PURE__ */ jsx("tr", {
                className: "border-b-2 border-neutral-900 bg-neutral-50",
                children: ["User", "Email Type", "Scheduled", "Status", ""].map((h) => /* @__PURE__ */ jsx("th", {
                  className: "px-4 py-3 text-left font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-600",
                  children: h
                }, h))
              })
            }), /* @__PURE__ */ jsx("tbody", {
              children: /* @__PURE__ */ jsx(AnimatePresence, {
                children: filtered.map((email, i) => {
                  const isPending2 = !email.sent_at;
                  const isDue = isPending2 && new Date(email.scheduled_at) <= /* @__PURE__ */ new Date();
                  return /* @__PURE__ */ jsxs(motion.tr, {
                    initial: {
                      opacity: 0
                    },
                    animate: {
                      opacity: 1
                    },
                    exit: {
                      opacity: 0,
                      height: 0
                    },
                    transition: {
                      duration: 0.2,
                      delay: i * 0.02
                    },
                    className: "border-b border-neutral-100 last:border-0 hover:bg-neutral-50",
                    children: [/* @__PURE__ */ jsxs("td", {
                      className: "px-4 py-3",
                      children: [/* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-sm font-medium text-neutral-900",
                        children: email.user_name || "—"
                      }), /* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-xs text-neutral-500",
                        children: email.user_email
                      })]
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-3",
                      children: /* @__PURE__ */ jsx("span", {
                        className: "inline-block rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 font-['Satoshi'] text-xs font-medium text-violet-700",
                        children: EMAIL_TYPE_LABELS[email.email_type] ?? email.email_type
                      })
                    }), /* @__PURE__ */ jsxs("td", {
                      className: "px-4 py-3",
                      children: [/* @__PURE__ */ jsx("div", {
                        className: "font-['Satoshi'] text-sm text-neutral-700",
                        children: formatDate(email.scheduled_at)
                      }), /* @__PURE__ */ jsx("div", {
                        className: `font-['Satoshi'] text-xs ${isDue ? "text-amber-600 font-medium" : "text-neutral-400"}`,
                        children: relativeTo(email.scheduled_at)
                      })]
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-3",
                      children: email.sent_at ? /* @__PURE__ */ jsxs("span", {
                        className: "inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 font-['Satoshi'] text-xs font-medium text-green-700",
                        children: [/* @__PURE__ */ jsx("span", {
                          className: "h-1.5 w-1.5 rounded-full bg-green-500"
                        }), "Sent ", formatDate(email.sent_at)]
                      }) : isDue ? /* @__PURE__ */ jsxs("span", {
                        className: "inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-['Satoshi'] text-xs font-medium text-amber-700",
                        children: [/* @__PURE__ */ jsx("span", {
                          className: "h-1.5 w-1.5 rounded-full bg-amber-500"
                        }), "Due"]
                      }) : /* @__PURE__ */ jsxs("span", {
                        className: "inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-['Satoshi'] text-xs font-medium text-blue-700",
                        children: [/* @__PURE__ */ jsx("span", {
                          className: "h-1.5 w-1.5 rounded-full bg-blue-400"
                        }), "Scheduled"]
                      })
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-4 py-3 text-right",
                      children: isPending2 && /* @__PURE__ */ jsx("button", {
                        onClick: () => handleCancel(email.id, email.user_email),
                        disabled: cancelling === email.id,
                        className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1 font-['Satoshi'] text-xs font-medium text-red-600 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-red-50 hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50",
                        children: cancelling === email.id ? "Cancelling…" : "Cancel"
                      })
                    })]
                  }, email.id);
                })
              })
            })]
          })
        })
      }), total > limit && /* @__PURE__ */ jsxs("div", {
        className: "mt-4 flex items-center justify-between font-['Satoshi'] text-sm text-neutral-600",
        children: [/* @__PURE__ */ jsxs("span", {
          children: ["Showing ", offset + 1, "–", Math.min(offset + limit, total), " of ", total]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(Math.max(0, offset - limit)),
            disabled: offset === 0,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
            children: "Previous"
          }), /* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(offset + limit),
            disabled: offset + limit >= total,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
            children: "Next"
          })]
        })]
      })]
    })]
  });
});
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: emailSequences,
  meta: meta$a
}, Symbol.toStringTag, { value: "Module" }));
function meta$9({}) {
  return [{
    title: "Chat Logs – Admin Panel"
  }];
}
const SOURCE_COLORS = {
  nlp: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  llm: "bg-violet-100 text-violet-800 border border-violet-300",
  escalation: "bg-red-100 text-red-800 border border-red-300"
};
const SOURCE_FILTERS = [{
  label: "All",
  value: ""
}, {
  label: "NLP",
  value: "nlp"
}, {
  label: "LLM",
  value: "llm"
}, {
  label: "Escalation",
  value: "escalation"
}];
const chatLogs = UNSAFE_withComponentProps(function ChatLogs() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const limit = 50;
  const fetchLogs = async (off = 0, src = "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: off.toString()
      });
      if (src) params.append("source", src);
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/chat-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message || "Failed to load chat logs");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!isAuthorized) return;
    fetchLogs(offset, sourceFilter);
  }, [isAuthorized, offset, sourceFilter]);
  if (isPending) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsx("div", {
        className: "h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500"
      })
    });
  }
  if (!isAuthorized) return null;
  const totalFromStats = stats ? parseInt(stats.total) : 0;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8",
      children: [/* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 20
        },
        animate: {
          opacity: 1,
          y: 0
        },
        className: "mb-8",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-4xl font-bold text-neutral-900 md:text-5xl",
          children: "Chat Logs"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-2 font-['Satoshi'] text-neutral-500",
          children: "Support conversations from the chat widget — last 30 days"
        })]
      }), stats && /* @__PURE__ */ jsx("div", {
        className: "mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8",
        children: [{
          label: "Total (30d)",
          value: stats.total,
          color: "bg-violet-500"
        }, {
          label: "Last 24h",
          value: stats.last_24h,
          color: "bg-pink-500"
        }, {
          label: "Last 7d",
          value: stats.last_7d,
          color: "bg-amber-500"
        }, {
          label: "Sessions",
          value: stats.unique_sessions,
          color: "bg-teal-500"
        }, {
          label: "NLP",
          value: stats.nlp_count,
          color: "bg-emerald-500"
        }, {
          label: "LLM",
          value: stats.llm_count,
          color: "bg-blue-500"
        }, {
          label: "Escalated",
          value: stats.escalation_count,
          color: "bg-red-500"
        }, {
          label: "Avg Conf.",
          value: parseFloat(stats.avg_confidence || "0").toFixed(2),
          color: "bg-orange-500"
        }].map((stat, i) => /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            y: 20
          },
          animate: {
            opacity: 1,
            y: 0
          },
          transition: {
            delay: i * 0.05
          },
          className: `rounded-2xl border-2 border-neutral-900 ${stat.color} p-4 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`,
          children: [/* @__PURE__ */ jsx("div", {
            className: "font-['Clash_Display'] text-2xl font-bold text-white",
            children: stat.value
          }), /* @__PURE__ */ jsx("div", {
            className: "font-['Satoshi'] text-xs font-medium text-white/80",
            children: stat.label
          })]
        }, stat.label))
      }), /* @__PURE__ */ jsxs("div", {
        className: "mb-4 flex flex-wrap items-center justify-between gap-3",
        children: [/* @__PURE__ */ jsx("div", {
          className: "flex gap-2",
          children: SOURCE_FILTERS.map((f) => /* @__PURE__ */ jsx("button", {
            onClick: () => {
              setSourceFilter(f.value);
              setOffset(0);
            },
            className: `rounded-lg border-2 px-3 py-1.5 font-['Satoshi'] text-sm font-medium transition-all ${sourceFilter === f.value ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"}`,
            children: f.label
          }, f.value))
        }), /* @__PURE__ */ jsx("button", {
          onClick: () => fetchLogs(offset, sourceFilter),
          disabled: loading,
          className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50 disabled:opacity-50",
          children: loading ? "Loading..." : "Refresh"
        })]
      }), error && /* @__PURE__ */ jsx("div", {
        className: "mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 font-['Satoshi'] text-sm text-red-700",
        children: error
      }), loading && !logs.length ? /* @__PURE__ */ jsx("div", {
        className: "flex h-48 items-center justify-center",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-8 w-8 animate-spin rounded-full border-4 border-neutral-900 border-t-violet-500"
        })
      }) : logs.length === 0 ? /* @__PURE__ */ jsx("div", {
        className: "rounded-2xl border-2 border-neutral-200 bg-white p-12 text-center",
        children: /* @__PURE__ */ jsx("p", {
          className: "font-['Satoshi'] text-neutral-400",
          children: "No chat logs found."
        })
      }) : /* @__PURE__ */ jsx("div", {
        className: "overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: /* @__PURE__ */ jsxs("table", {
          className: "w-full min-w-[700px]",
          children: [/* @__PURE__ */ jsx("thead", {
            children: /* @__PURE__ */ jsx("tr", {
              className: "border-b-2 border-neutral-900 bg-neutral-50",
              children: ["Time", "Session", "Source", "Conf.", "User Message", "Bot Response"].map((h) => /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                children: h
              }, h))
            })
          }), /* @__PURE__ */ jsx("tbody", {
            children: logs.map((log, i) => {
              const isExpanded = expandedId === log.id;
              return /* @__PURE__ */ jsxs(motion.tr, {
                initial: {
                  opacity: 0
                },
                animate: {
                  opacity: 1
                },
                transition: {
                  delay: i * 0.02
                },
                onClick: () => setExpandedId(isExpanded ? null : log.id),
                className: `cursor-pointer border-b border-neutral-100 transition-colors last:border-0 ${isExpanded ? "bg-violet-50" : "hover:bg-neutral-50"}`,
                children: [/* @__PURE__ */ jsx("td", {
                  className: "whitespace-nowrap px-4 py-3 font-['Satoshi'] text-xs text-neutral-500",
                  children: new Date(log.created_at).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                }), /* @__PURE__ */ jsxs("td", {
                  className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-400",
                  children: [log.session_id.slice(0, 18), "…"]
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: /* @__PURE__ */ jsxs("span", {
                    className: `rounded-full px-2 py-0.5 font-['Satoshi'] text-xs font-semibold ${SOURCE_COLORS[log.source] || "bg-neutral-100 text-neutral-600"}`,
                    children: [log.source.toUpperCase(), log.intent_id && ` · ${log.intent_id}`]
                  })
                }), /* @__PURE__ */ jsxs("td", {
                  className: "px-4 py-3 font-['Satoshi'] text-xs text-neutral-600",
                  children: [(log.confidence * 100).toFixed(0), "%"]
                }), /* @__PURE__ */ jsx("td", {
                  className: "max-w-[200px] px-4 py-3",
                  children: /* @__PURE__ */ jsx("p", {
                    className: `font-['Satoshi'] text-sm text-neutral-900 ${isExpanded ? "" : "line-clamp-1"}`,
                    children: log.user_message
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "max-w-[260px] px-4 py-3",
                  children: /* @__PURE__ */ jsx("p", {
                    className: `font-['Satoshi'] text-sm text-neutral-600 ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-1"}`,
                    children: log.bot_response
                  })
                })]
              }, log.id);
            })
          })]
        })
      }), totalFromStats > limit && /* @__PURE__ */ jsxs("div", {
        className: "mt-4 flex items-center justify-between",
        children: [/* @__PURE__ */ jsxs("p", {
          className: "font-['Satoshi'] text-sm text-neutral-500",
          children: ["Showing ", offset + 1, "–", Math.min(offset + limit, totalFromStats), " of ", totalFromStats]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex gap-2",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(Math.max(0, offset - limit)),
            disabled: offset === 0,
            className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
            children: "Previous"
          }), /* @__PURE__ */ jsx("button", {
            onClick: () => setOffset(offset + limit),
            disabled: offset + limit >= totalFromStats,
            className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
            children: "Next"
          })]
        })]
      })]
    })]
  });
});
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: chatLogs,
  meta: meta$9
}, Symbol.toStringTag, { value: "Module" }));
async function loader$a({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    });
  }
  const roleResult = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = roleResult.rows[0]?.role;
  if (role !== "admin" && role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const source2 = url.searchParams.get("source") || "";
  const whereClause = source2 ? sql`WHERE source = ${source2}` : sql``;
  const [logsResult, statsResult] = await Promise.all([db.execute(sql`
      SELECT id, session_id, user_message, bot_response, source, confidence, intent_id, created_at
      FROM support_chat_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `), db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE source = 'nlp') AS nlp_count,
        COUNT(*) FILTER (WHERE source = 'llm') AS llm_count,
        COUNT(*) FILTER (WHERE source = 'escalation') AS escalation_count,
        COUNT(DISTINCT session_id) AS unique_sessions,
        ROUND(AVG(confidence)::numeric, 2) AS avg_confidence,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d
      FROM support_chat_logs
      WHERE created_at > NOW() - INTERVAL '30 days'
    `)]);
  return Response.json({
    logs: logsResult.rows,
    stats: statsResult.rows[0],
    limit,
    offset
  });
}
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
function meta$8({}) {
  return [{
    title: "Ops Alerts – Admin Panel"
  }];
}
const STATUS_FILTERS$1 = [{
  label: "All",
  value: "all"
}, {
  label: "Open",
  value: "open"
}, {
  label: "Acknowledged",
  value: "acked"
}];
function relativeTime$1(iso) {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diff = (Date.now() - ts) / 1e3;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
const opsAlerts = UNSAFE_withComponentProps(function OpsAlerts() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("open");
  const [acking, setAcking] = useState(null);
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams({
        status: filter,
        limit: "100"
      });
      const res = await fetch(`/api/ops-alerts?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => {
    if (isAuthorized) fetchAlerts();
  }, [isAuthorized, fetchAlerts]);
  useEffect(() => {
    if (!isAuthorized) return;
    const id = setInterval(fetchAlerts, 3e4);
    return () => clearInterval(id);
  }, [isAuthorized, fetchAlerts]);
  const acknowledge = async (id) => {
    setAcking(id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/ops-alerts/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchAlerts();
    } catch (e) {
      setError(e.message || "Failed to acknowledge");
    } finally {
      setAcking(null);
    }
  };
  if (isPending) {
    return /* @__PURE__ */ jsx("div", {
      className: "min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500",
      children: "Loading..."
    });
  }
  if (!isAuthorized) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsx("main", {
      className: "mx-auto max-w-[1280px] px-6 py-8",
      children: /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex items-end justify-between mb-6",
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h1", {
              className: "text-3xl font-bold text-neutral-900",
              children: "Ops Alerts"
            }), /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-500 mt-1",
              children: "Pod restart spikes from the in-cluster watcher. Auto-refreshes every 30s."
            })]
          }), /* @__PURE__ */ jsx("button", {
            type: "button",
            onClick: fetchAlerts,
            className: "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100",
            children: "Refresh"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "grid grid-cols-2 md:grid-cols-4 gap-3 mb-6",
          children: [/* @__PURE__ */ jsx(StatTile$1, {
            label: "Open",
            value: stats?.open_count,
            highlight: Number(stats?.open_count) > 0
          }), /* @__PURE__ */ jsx(StatTile$1, {
            label: "Last 24h",
            value: stats?.last_24h
          }), /* @__PURE__ */ jsx(StatTile$1, {
            label: "Last 7d",
            value: stats?.last_7d
          }), /* @__PURE__ */ jsx(StatTile$1, {
            label: "Total (30d)",
            value: stats?.total
          })]
        }), /* @__PURE__ */ jsx("div", {
          className: "flex gap-2 mb-4",
          children: STATUS_FILTERS$1.map((f) => /* @__PURE__ */ jsx("button", {
            type: "button",
            onClick: () => setFilter(f.value),
            className: `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filter === f.value ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-100"}`,
            children: f.label
          }, f.value))
        }), error && /* @__PURE__ */ jsx("div", {
          className: "mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700",
          children: error
        }), /* @__PURE__ */ jsx("div", {
          className: "rounded-xl border border-neutral-200 bg-white overflow-hidden",
          children: loading && alerts.length === 0 ? /* @__PURE__ */ jsx("div", {
            className: "p-8 text-center text-neutral-500",
            children: "Loading…"
          }) : alerts.length === 0 ? /* @__PURE__ */ jsx("div", {
            className: "p-8 text-center text-neutral-500",
            children: filter === "open" ? "No open alerts. Cluster looks healthy." : "No alerts in range."
          }) : /* @__PURE__ */ jsxs("table", {
            className: "w-full text-sm",
            children: [/* @__PURE__ */ jsx("thead", {
              className: "bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500",
              children: /* @__PURE__ */ jsxs("tr", {
                children: [/* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "When"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Pod"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Restarts"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Last restart"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Status"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-right px-4 py-3",
                  children: "Action"
                })]
              })
            }), /* @__PURE__ */ jsx("tbody", {
              className: "divide-y divide-neutral-100",
              children: alerts.map((a) => {
                const open = !a.acknowledged_at;
                return /* @__PURE__ */ jsxs("tr", {
                  className: open ? "bg-amber-50/40" : "bg-white",
                  children: [/* @__PURE__ */ jsxs("td", {
                    className: "px-4 py-3 text-neutral-700",
                    children: [/* @__PURE__ */ jsx("div", {
                      children: relativeTime$1(a.created_at)
                    }), /* @__PURE__ */ jsx("div", {
                      className: "text-xs text-neutral-400",
                      children: new Date(a.created_at).toLocaleString("en-GB")
                    })]
                  }), /* @__PURE__ */ jsxs("td", {
                    className: "px-4 py-3",
                    children: [/* @__PURE__ */ jsxs("div", {
                      className: "font-mono text-xs text-neutral-900",
                      children: [a.namespace, "/", a.pod]
                    }), /* @__PURE__ */ jsxs("div", {
                      className: "font-mono text-[11px] text-neutral-500",
                      children: ["container: ", a.container]
                    })]
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-4 py-3",
                    children: /* @__PURE__ */ jsx("span", {
                      className: "inline-flex items-center rounded-md bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 text-xs font-bold",
                      children: a.restart_count
                    })
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-4 py-3 text-neutral-700",
                    children: relativeTime$1(a.last_restart_at)
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-4 py-3",
                    children: open ? /* @__PURE__ */ jsx("span", {
                      className: "inline-flex items-center rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-xs font-bold",
                      children: "Open"
                    }) : /* @__PURE__ */ jsxs("div", {
                      children: [/* @__PURE__ */ jsx("span", {
                        className: "inline-flex items-center rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-xs font-bold",
                        children: "Acknowledged"
                      }), /* @__PURE__ */ jsxs("div", {
                        className: "text-[11px] text-neutral-500 mt-0.5",
                        children: ["by ", a.acknowledged_by, " · ", relativeTime$1(a.acknowledged_at)]
                      })]
                    })
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-4 py-3 text-right",
                    children: open && /* @__PURE__ */ jsx("button", {
                      type: "button",
                      onClick: () => acknowledge(a.id),
                      disabled: acking === a.id,
                      className: "rounded-lg bg-neutral-900 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50",
                      children: acking === a.id ? "..." : "Acknowledge"
                    })
                  })]
                }, a.id);
              })
            })]
          })
        })]
      })
    })]
  });
});
function StatTile$1({
  label,
  value,
  highlight
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: `rounded-xl border bg-white px-4 py-3 ${highlight ? "border-amber-400 ring-2 ring-amber-200" : "border-neutral-200"}`,
    children: [/* @__PURE__ */ jsx("div", {
      className: "text-xs uppercase tracking-wider text-neutral-500",
      children: label
    }), /* @__PURE__ */ jsx("div", {
      className: "text-2xl font-bold text-neutral-900 mt-0.5",
      children: value ?? "–"
    })]
  });
}
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: opsAlerts,
  meta: meta$8
}, Symbol.toStringTag, { value: "Module" }));
const INGEST_TOKEN = process.env.OPS_ALERT_INGEST_TOKEN;
let tableReady = false;
async function ensureTable$1() {
  if (tableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ops_alerts (
      id SERIAL PRIMARY KEY,
      namespace TEXT NOT NULL,
      pod TEXT NOT NULL,
      container TEXT NOT NULL,
      restart_count INTEGER NOT NULL,
      last_restart_at TIMESTAMPTZ,
      summary TEXT NOT NULL,
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ops_alerts_created_at
      ON ops_alerts (created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ops_alerts_open
      ON ops_alerts (acknowledged_at) WHERE acknowledged_at IS NULL
  `);
  tableReady = true;
}
async function action$6({
  request
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  if (!INGEST_TOKEN) {
    return Response.json({
      error: "Ingest token not configured"
    }, {
      status: 503
    });
  }
  const provided = request.headers.get("x-alert-token") ?? "";
  if (provided !== INGEST_TOKEN) {
    return Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({
      error: "Invalid JSON"
    }, {
      status: 400
    });
  }
  const alerts = Array.isArray(body?.alerts) ? body.alerts : [];
  if (alerts.length === 0) {
    return Response.json({
      ok: true,
      inserted: 0
    });
  }
  await ensureTable$1();
  let inserted = 0;
  for (const a of alerts) {
    if (!a?.namespace || !a?.pod || !a?.container) continue;
    const restartCount = Number(a.restart_count) || 0;
    const lastRestartAt = a.last_restart_at || null;
    const summary = String(a.summary || `${a.namespace}/${a.pod} restarted ${restartCount} times`);
    const existing = await db.execute(sql`
      SELECT id FROM ops_alerts
      WHERE namespace = ${a.namespace}
        AND pod = ${a.pod}
        AND container = ${a.container}
        AND acknowledged_at IS NULL
        AND created_at > NOW() - INTERVAL '1 hour'
      LIMIT 1
    `);
    if (existing.rows.length > 0) continue;
    await db.execute(sql`
      INSERT INTO ops_alerts
        (namespace, pod, container, restart_count, last_restart_at, summary)
      VALUES
        (${a.namespace}, ${a.pod}, ${a.container}, ${restartCount},
         ${lastRestartAt}, ${summary})
    `);
    inserted++;
  }
  return Response.json({
    ok: true,
    inserted
  });
}
async function loader$9({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const roleResult = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = roleResult.rows[0]?.role;
  if (role !== "admin" && role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  await ensureTable$1();
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const whereClause = statusFilter === "open" ? sql`WHERE acknowledged_at IS NULL` : statusFilter === "acked" ? sql`WHERE acknowledged_at IS NOT NULL` : sql``;
  const [alertsResult, statsResult] = await Promise.all([db.execute(sql`
      SELECT id, namespace, pod, container, restart_count, last_restart_at,
             summary, acknowledged_at, acknowledged_by, created_at
      FROM ops_alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `), db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE acknowledged_at IS NULL) AS open_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d
      FROM ops_alerts
      WHERE created_at > NOW() - INTERVAL '30 days'
    `)]);
  return Response.json({
    alerts: alertsResult.rows,
    stats: statsResult.rows[0]
  });
}
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
async function action$5({
  request,
  params
}) {
  if (request.method !== "PATCH" && request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const roleResult = await db.execute(sql`SELECT role, email FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = roleResult.rows[0]?.role;
  const email = roleResult.rows[0]?.email || user.id;
  if (role !== "admin" && role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({
      error: "Invalid id"
    }, {
      status: 400
    });
  }
  const result = await db.execute(sql`
    UPDATE ops_alerts
    SET acknowledged_at = NOW(), acknowledged_by = ${email}
    WHERE id = ${id} AND acknowledged_at IS NULL
    RETURNING id
  `);
  return Response.json({
    ok: true,
    acknowledged: result.rows.length > 0
  });
}
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
function meta$7({}) {
  return [{
    title: "Tickets – Admin Panel"
  }];
}
const STATUS_FILTERS = [{
  label: "Open",
  value: "open"
}, {
  label: "In progress",
  value: "in_progress"
}, {
  label: "Resolved",
  value: "resolved"
}, {
  label: "Won't fix",
  value: "wont_fix"
}, {
  label: "All",
  value: "all"
}];
const PRIORITY_BADGE$1 = {
  high: "bg-red-100 text-red-800 border-red-300",
  normal: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-neutral-100 text-neutral-700 border-neutral-300"
};
const STATUS_BADGE$1 = {
  open: "bg-amber-100 text-amber-800 border-amber-300",
  in_progress: "bg-violet-100 text-violet-800 border-violet-300",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wont_fix: "bg-neutral-100 text-neutral-700 border-neutral-300"
};
const CATEGORY_LABELS$1 = {
  campaign_broken: "Campaign broken",
  campaign_changes: "Campaign changes",
  website_broken: "Site broken",
  info_request: "Info request",
  other: "Other"
};
function relativeTime(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = (Date.now() - t) / 1e3;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
const tickets = UNSAFE_withComponentProps(function TicketsList() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [tickets2, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      const res = await fetch(`/api/tickets?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTickets(data.tickets || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter]);
  useEffect(() => {
    if (isAuthorized) fetchTickets();
  }, [isAuthorized, fetchTickets]);
  useEffect(() => {
    if (!isAuthorized) return;
    const id = setInterval(fetchTickets, 3e4);
    return () => clearInterval(id);
  }, [isAuthorized, fetchTickets]);
  if (isPending) {
    return /* @__PURE__ */ jsx("div", {
      className: "min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500",
      children: "Loading..."
    });
  }
  if (!isAuthorized) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsx("main", {
      className: "mx-auto max-w-[1280px] px-6 py-8",
      children: /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex items-end justify-between mb-6",
          children: [/* @__PURE__ */ jsxs("div", {
            children: [/* @__PURE__ */ jsx("h1", {
              className: "text-3xl font-bold text-neutral-900",
              children: "Tickets"
            }), /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-500 mt-1",
              children: "User-raised tickets from the support chat and outreach dashboard. Auto-refreshes every 30s."
            })]
          }), /* @__PURE__ */ jsx("button", {
            type: "button",
            onClick: fetchTickets,
            className: "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100",
            children: "Refresh"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "grid grid-cols-2 md:grid-cols-5 gap-3 mb-6",
          children: [/* @__PURE__ */ jsx(StatTile, {
            label: "Open",
            value: stats?.open,
            amber: Number(stats?.open) > 0
          }), /* @__PURE__ */ jsx(StatTile, {
            label: "High open",
            value: stats?.high_open,
            red: Number(stats?.high_open) > 0
          }), /* @__PURE__ */ jsx(StatTile, {
            label: "In progress",
            value: stats?.in_progress
          }), /* @__PURE__ */ jsx(StatTile, {
            label: "Resolved 7d",
            value: stats?.resolved_7d
          }), /* @__PURE__ */ jsx(StatTile, {
            label: "Total",
            value: stats?.total
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex flex-wrap gap-2 mb-4",
          children: [/* @__PURE__ */ jsx("div", {
            className: "flex gap-1.5",
            children: STATUS_FILTERS.map((f) => /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: () => setStatusFilter(f.value),
              className: `px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${statusFilter === f.value ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-100"}`,
              children: f.label
            }, f.value))
          }), /* @__PURE__ */ jsxs("select", {
            value: priorityFilter,
            onChange: (e) => setPriorityFilter(e.target.value),
            className: "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700",
            children: [/* @__PURE__ */ jsx("option", {
              value: "all",
              children: "Any priority"
            }), /* @__PURE__ */ jsx("option", {
              value: "high",
              children: "High"
            }), /* @__PURE__ */ jsx("option", {
              value: "normal",
              children: "Normal"
            }), /* @__PURE__ */ jsx("option", {
              value: "low",
              children: "Low"
            })]
          })]
        }), error && /* @__PURE__ */ jsx("div", {
          className: "mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700",
          children: error
        }), /* @__PURE__ */ jsx("div", {
          className: "rounded-xl border border-neutral-200 bg-white overflow-hidden",
          children: loading && tickets2.length === 0 ? /* @__PURE__ */ jsx("div", {
            className: "p-8 text-center text-neutral-500",
            children: "Loading…"
          }) : tickets2.length === 0 ? /* @__PURE__ */ jsx("div", {
            className: "p-8 text-center text-neutral-500",
            children: "No tickets in this filter."
          }) : /* @__PURE__ */ jsxs("table", {
            className: "w-full text-sm",
            children: [/* @__PURE__ */ jsx("thead", {
              className: "bg-neutral-50 text-xs uppercase tracking-wider text-neutral-500",
              children: /* @__PURE__ */ jsxs("tr", {
                children: [/* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "When"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Priority"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Category"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "User"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Preview"
                }), /* @__PURE__ */ jsx("th", {
                  className: "text-left px-4 py-3",
                  children: "Status"
                })]
              })
            }), /* @__PURE__ */ jsx("tbody", {
              className: "divide-y divide-neutral-100",
              children: tickets2.map((t) => /* @__PURE__ */ jsxs("tr", {
                className: `hover:bg-violet-50/40 transition-colors ${t.priority === "high" && t.status === "open" ? "bg-red-50/30" : ""}`,
                children: [/* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 align-top",
                  children: /* @__PURE__ */ jsxs(Link, {
                    to: `/tickets/${t.id}`,
                    className: "block text-neutral-700",
                    children: [/* @__PURE__ */ jsx("div", {
                      children: relativeTime(t.created_at)
                    }), /* @__PURE__ */ jsxs("div", {
                      className: "text-xs text-neutral-400",
                      children: ["#", t.id]
                    })]
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 align-top",
                  children: /* @__PURE__ */ jsx("span", {
                    className: `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${PRIORITY_BADGE$1[t.priority] || PRIORITY_BADGE$1.normal}`,
                    children: t.priority
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 align-top",
                  children: /* @__PURE__ */ jsxs(Link, {
                    to: `/tickets/${t.id}`,
                    className: "block",
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "font-semibold text-neutral-900",
                      children: CATEGORY_LABELS$1[t.category] || t.category
                    }), /* @__PURE__ */ jsxs("div", {
                      className: "text-xs text-neutral-500",
                      children: ["via ", t.source.replace("_", " ")]
                    })]
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 align-top",
                  children: /* @__PURE__ */ jsxs(Link, {
                    to: `/tickets/${t.id}`,
                    className: "block",
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "text-neutral-900",
                      children: t.user_name || t.user_email
                    }), /* @__PURE__ */ jsx("div", {
                      className: "text-xs text-neutral-500",
                      children: t.user_email
                    })]
                  })
                }), /* @__PURE__ */ jsxs("td", {
                  className: "px-4 py-3 align-top max-w-[400px]",
                  children: [/* @__PURE__ */ jsx(Link, {
                    to: `/tickets/${t.id}`,
                    className: "block text-neutral-700 line-clamp-2",
                    children: t.first_message
                  }), /* @__PURE__ */ jsxs("div", {
                    className: "text-xs text-neutral-400 mt-0.5",
                    children: [t.message_count, " message", t.message_count === 1 ? "" : "s"]
                  })]
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 align-top",
                  children: /* @__PURE__ */ jsx("span", {
                    className: `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${STATUS_BADGE$1[t.status] || STATUS_BADGE$1.open}`,
                    children: t.status.replace("_", " ")
                  })
                })]
              }, t.id))
            })]
          })
        })]
      })
    })]
  });
});
function StatTile({
  label,
  value,
  amber,
  red
}) {
  const border = red ? "border-red-400 ring-2 ring-red-200" : amber ? "border-amber-400 ring-2 ring-amber-200" : "border-neutral-200";
  return /* @__PURE__ */ jsxs("div", {
    className: `rounded-xl border bg-white px-4 py-3 ${border}`,
    children: [/* @__PURE__ */ jsx("div", {
      className: "text-xs uppercase tracking-wider text-neutral-500",
      children: label
    }), /* @__PURE__ */ jsx("div", {
      className: "text-2xl font-bold text-neutral-900 mt-0.5",
      children: value ?? "–"
    })]
  });
}
const route26 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: tickets,
  meta: meta$7
}, Symbol.toStringTag, { value: "Module" }));
function meta$6({
  params
}) {
  return [{
    title: `Ticket #${params.id} – Admin Panel`
  }];
}
const STATUS_BADGE = {
  open: "bg-amber-100 text-amber-800 border-amber-300",
  in_progress: "bg-violet-100 text-violet-800 border-violet-300",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wont_fix: "bg-neutral-100 text-neutral-700 border-neutral-300"
};
const PRIORITY_BADGE = {
  high: "bg-red-100 text-red-800 border-red-300",
  normal: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-neutral-100 text-neutral-700 border-neutral-300"
};
const CATEGORY_LABELS = {
  campaign_broken: "Campaign broken",
  campaign_changes: "Campaign changes",
  website_broken: "Site broken",
  info_request: "Info request",
  other: "Other"
};
const STATUS_OPTIONS = [{
  value: "open",
  label: "Open"
}, {
  value: "in_progress",
  label: "In progress"
}, {
  value: "resolved",
  label: "Resolved"
}, {
  value: "wont_fix",
  label: "Won't fix"
}];
function fmt(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
const tickets_$id = UNSAFE_withComponentProps(function TicketDetailPage({
  params
}) {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [assignee, setAssignee] = useState("");
  const bottomRef = useRef(null);
  const id = Number(params.id);
  const fetchDetail = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/tickets/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetail(data);
      setAssignee(data.assignee_email || "");
    } catch (e) {
      setError(e.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    if (isAuthorized) fetchDetail();
  }, [isAuthorized, fetchDetail]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [detail?.messages.length]);
  const sendReply = async (alsoResolve = false) => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/tickets/${id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        credentials: "include",
        body: JSON.stringify({
          body: text
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      setReply("");
      if (alsoResolve) await updateTicket({
        status: "resolved"
      });
      else await fetchDetail();
    } finally {
      setSending(false);
    }
  };
  const updateTicket = async (patch) => {
    setSavingStatus(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        credentials: "include",
        body: JSON.stringify(patch)
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      await fetchDetail();
    } finally {
      setSavingStatus(false);
    }
  };
  if (isPending || loading) {
    return /* @__PURE__ */ jsx("div", {
      className: "min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500",
      children: "Loading..."
    });
  }
  if (!isAuthorized) return null;
  if (error || !detail) {
    return /* @__PURE__ */ jsxs("div", {
      className: "min-h-screen bg-neutral-50",
      children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
        className: "mx-auto max-w-[1100px] px-6 py-8",
        children: [/* @__PURE__ */ jsx(Link, {
          to: "/tickets",
          className: "text-sm font-semibold text-violet-700",
          children: "← Back to tickets"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-4 text-red-700",
          children: error || "Not found"
        })]
      })]
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsx("main", {
      className: "mx-auto max-w-[1100px] px-6 py-8",
      children: /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        children: [/* @__PURE__ */ jsx(Link, {
          to: "/tickets",
          className: "inline-block mb-4 text-sm font-semibold text-violet-700 hover:underline",
          children: "← Back to tickets"
        }), /* @__PURE__ */ jsx("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-5 mb-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: /* @__PURE__ */ jsxs("div", {
            className: "flex items-start justify-between gap-4 flex-wrap",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2 mb-1",
                children: [/* @__PURE__ */ jsxs("span", {
                  className: `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${PRIORITY_BADGE[detail.priority] || PRIORITY_BADGE.normal}`,
                  children: [detail.priority, " priority"]
                }), /* @__PURE__ */ jsx("span", {
                  className: `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[detail.status] || STATUS_BADGE.open}`,
                  children: detail.status.replace("_", " ")
                }), /* @__PURE__ */ jsxs("span", {
                  className: "text-xs text-neutral-500",
                  children: ["#", detail.id, " · via ", detail.source.replace("_", " ")]
                })]
              }), /* @__PURE__ */ jsx("h1", {
                className: "text-2xl font-bold text-neutral-900",
                children: CATEGORY_LABELS[detail.category] || detail.category
              }), /* @__PURE__ */ jsxs("p", {
                className: "mt-1 text-sm text-neutral-600",
                children: ["Raised by", " ", /* @__PURE__ */ jsx("span", {
                  className: "font-semibold",
                  children: detail.user_name || detail.user_email
                }), " ", "· ", fmt(detail.created_at)]
              }), detail.context && Object.keys(detail.context).length > 0 && /* @__PURE__ */ jsx("div", {
                className: "mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700",
                children: Object.entries(detail.context).map(([k, v]) => v == null ? null : /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsxs("strong", {
                    children: [k, ":"]
                  }), " ", String(v)]
                }, k))
              }), detail.attachments && detail.attachments.length > 0 && /* @__PURE__ */ jsxs("div", {
                className: "mt-3",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5",
                  children: ["Screenshots (", detail.attachments.length, ")"]
                }), /* @__PURE__ */ jsx("div", {
                  className: "grid grid-cols-3 sm:grid-cols-6 gap-2",
                  children: detail.attachments.map((a, i) => /* @__PURE__ */ jsx("a", {
                    href: a.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "block overflow-hidden rounded-lg border-2 border-neutral-300 bg-neutral-100 hover:border-neutral-900 transition-colors",
                    title: a.filename || `Screenshot ${i + 1}`,
                    children: /* @__PURE__ */ jsx("img", {
                      src: a.url,
                      alt: a.filename || `Screenshot ${i + 1}`,
                      className: "block h-24 w-full object-cover"
                    })
                  }, i))
                })]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex flex-col gap-2 min-w-[200px]",
              children: [/* @__PURE__ */ jsx("label", {
                className: "text-xs font-bold text-neutral-700",
                children: "Status"
              }), /* @__PURE__ */ jsx("select", {
                value: detail.status,
                onChange: (e) => updateTicket({
                  status: e.target.value
                }),
                disabled: savingStatus,
                className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-semibold",
                children: STATUS_OPTIONS.map((s) => /* @__PURE__ */ jsx("option", {
                  value: s.value,
                  children: s.label
                }, s.value))
              }), /* @__PURE__ */ jsx("label", {
                className: "text-xs font-bold text-neutral-700 mt-2",
                children: "Assignee email"
              }), /* @__PURE__ */ jsx("input", {
                type: "email",
                value: assignee,
                onChange: (e) => setAssignee(e.target.value),
                onBlur: () => {
                  if (assignee !== (detail.assignee_email || "")) {
                    updateTicket({
                      assignee_email: assignee
                    });
                  }
                },
                placeholder: "unassigned",
                className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm"
              })]
            })]
          })
        }), /* @__PURE__ */ jsxs("div", {
          className: "space-y-3 mb-5",
          children: [detail.messages.map((m) => {
            const isUser = m.author_type === "user";
            return /* @__PURE__ */ jsx("div", {
              className: `flex ${isUser ? "justify-start" : "justify-end"}`,
              children: /* @__PURE__ */ jsxs("div", {
                className: `max-w-[80%] rounded-2xl border-2 border-neutral-900 px-4 py-3 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${isUser ? "bg-white text-neutral-900" : m.author_type === "admin" ? "bg-violet-500 text-white" : "bg-neutral-100 text-neutral-700"}`,
                children: [/* @__PURE__ */ jsxs("div", {
                  className: `text-[11px] font-bold mb-1 ${isUser ? "text-neutral-500" : m.author_type === "admin" ? "text-white/80" : "text-neutral-500"}`,
                  children: [m.author_type === "user" ? m.author_email : m.author_type === "admin" ? `${m.author_email} (studojo team)` : "system", " ", "· ", fmt(m.created_at)]
                }), /* @__PURE__ */ jsx("p", {
                  className: "text-sm whitespace-pre-wrap",
                  children: m.body
                })]
              })
            }, m.id);
          }), /* @__PURE__ */ jsx("div", {
            ref: bottomRef
          })]
        }), detail.status === "resolved" || detail.status === "wont_fix" ? /* @__PURE__ */ jsx("div", {
          className: "rounded-xl border-2 border-neutral-300 bg-neutral-100 px-4 py-4 text-center text-sm text-neutral-600",
          children: "This ticket is closed. Re-open from the status dropdown to reply."
        }) : /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white p-3 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("textarea", {
            value: reply,
            onChange: (e) => setReply(e.target.value),
            rows: 4,
            placeholder: "Reply to the user. They'll get this as an email and see it in their support chat.",
            className: "w-full rounded-lg border-2 border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 resize-none"
          }), /* @__PURE__ */ jsxs("div", {
            className: "flex justify-between mt-2",
            children: [/* @__PURE__ */ jsxs("span", {
              className: "text-[11px] text-neutral-400",
              children: [reply.length, " / 5000"]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex gap-2",
              children: [/* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: () => sendReply(true),
                disabled: sending || !reply.trim(),
                className: "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-bold text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40",
                children: "Send + resolve"
              }), /* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: () => sendReply(false),
                disabled: sending || !reply.trim(),
                className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50",
                children: sending ? "Sending..." : "Send reply"
              })]
            })]
          })]
        })]
      })
    })]
  });
});
const route27 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: tickets_$id,
  meta: meta$6
}, Symbol.toStringTag, { value: "Module" }));
async function tablesExist() {
  const r = await db.execute(sql`
    SELECT to_regclass('public.tickets') AS t
  `);
  return Boolean(r.rows[0]?.t);
}
async function loader$8({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const roleResult = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = roleResult.rows[0]?.role;
  if (role !== "admin" && role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  if (!await tablesExist()) {
    return Response.json({
      tickets: [],
      stats: {
        total: 0,
        open: 0,
        high_open: 0,
        in_progress: 0,
        resolved_7d: 0
      }
    });
  }
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const priority = url.searchParams.get("priority") || "all";
  const category = url.searchParams.get("category") || "all";
  const where = sql`
    1=1
    ${status !== "all" ? sql`AND status = ${status}` : sql``}
    ${priority !== "all" ? sql`AND priority = ${priority}` : sql``}
    ${category !== "all" ? sql`AND category = ${category}` : sql``}
  `;
  const [list, stats] = await Promise.all([db.execute(sql`
      SELECT
        t.id, t.user_id, t.user_email, t.user_name,
        t.category, t.priority, t.status, t.source,
        t.context, t.assignee_email,
        t.created_at, t.updated_at, t.closed_at,
        COALESCE(
          (SELECT LEFT(m.body, 160) FROM ticket_messages m
           WHERE m.ticket_id = t.id
           ORDER BY m.created_at ASC LIMIT 1),
          ''
        ) AS first_message,
        (SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count
      FROM tickets t
      WHERE ${where}
      ORDER BY
        CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        t.created_at DESC
      LIMIT 300
    `), db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'open' AND priority = 'high') AS high_open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved' AND closed_at > NOW() - INTERVAL '7 days') AS resolved_7d
      FROM tickets
    `)]);
  return Response.json({
    tickets: list.rows,
    stats: stats.rows[0]
  });
}
const route28 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const ALLOWED_STATUSES = ["open", "in_progress", "resolved", "wont_fix"];
async function requireAdmin(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return {
      error: Response.json({
        error: "Unauthorized"
      }, {
        status: 401
      })
    };
  }
  const r = await db.execute(sql`SELECT role, email FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = r.rows[0]?.role;
  const email = r.rows[0]?.email;
  if (role !== "admin" && role !== "ops") {
    return {
      error: Response.json({
        error: "Forbidden"
      }, {
        status: 403
      })
    };
  }
  return {
    user,
    email: email || user.id
  };
}
async function loader$7({
  request,
  params
}) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({
      error: "Invalid id"
    }, {
      status: 400
    });
  }
  const tRes = await db.execute(sql`
    SELECT id, user_id, user_email, user_name, category, priority, status,
           source, context, assignee_email, attachments,
           created_at, updated_at, closed_at
    FROM tickets WHERE id = ${id} LIMIT 1
  `);
  const ticket = tRes.rows[0];
  if (!ticket) return Response.json({
    error: "Not found"
  }, {
    status: 404
  });
  const mRes = await db.execute(sql`
    SELECT id, ticket_id, author_type, author_email, body, created_at
    FROM ticket_messages
    WHERE ticket_id = ${id}
    ORDER BY created_at ASC
  `);
  return Response.json({
    ...ticket,
    messages: mRes.rows
  });
}
async function action$4({
  request,
  params
}) {
  if (request.method !== "PATCH" && request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({
      error: "Invalid id"
    }, {
      status: 400
    });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({
      error: "Invalid JSON"
    }, {
      status: 400
    });
  }
  const status = typeof body?.status === "string" ? body.status : void 0;
  const assignee_email = typeof body?.assignee_email === "string" ? body.assignee_email : void 0;
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return Response.json({
      error: "Invalid status"
    }, {
      status: 400
    });
  }
  const closedAtClause = status === "resolved" || status === "wont_fix" ? sql`, closed_at = NOW()` : status === "open" || status === "in_progress" ? sql`, closed_at = NULL` : sql``;
  const result = await db.execute(sql`
    UPDATE tickets
    SET
      updated_at = NOW()
      ${status !== void 0 ? sql`, status = ${status}` : sql``}
      ${assignee_email !== void 0 ? sql`, assignee_email = ${assignee_email || null}` : sql``}
      ${closedAtClause}
    WHERE id = ${id}
    RETURNING id, status, assignee_email, closed_at, updated_at
  `);
  if (result.rows.length === 0) {
    return Response.json({
      error: "Not found"
    }, {
      status: 404
    });
  }
  return Response.json({
    ok: true,
    ticket: result.rows[0]
  });
}
const route29 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
async function getEmailerServiceUrl() {
  return process.env.EMAILER_SERVICE_URL || null;
}
async function notifyUserOfReply(opts) {
  const base = await getEmailerServiceUrl();
  if (!base) {
    console.warn("[tickets] EMAILER_SERVICE_URL not configured; user-reply email skipped");
    return;
  }
  try {
    const res = await fetch(`${base}/v1/email/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        routing_key: "event.ticket.replied",
        event: {
          ...opts,
          studojo_url: `https://studojo.com/`
        }
      })
    });
    if (!res.ok) {
      console.error(`[tickets] emailer reply -> HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("[tickets] failed to notify user of reply:", e?.message);
  }
}
async function action$3({
  request,
  params
}) {
  if (request.method !== "POST") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const roleRes = await db.execute(sql`SELECT role, email, name FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const row = roleRes.rows[0];
  if (!row || row.role !== "admin" && row.role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  const adminEmail = row.email || user.id;
  const adminName = row.name || row.email?.split("@")[0] || "studojo team";
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json({
      error: "Invalid id"
    }, {
      status: 400
    });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({
      error: "Invalid JSON"
    }, {
      status: 400
    });
  }
  const text = String(body?.body || "").trim();
  if (text.length < 1) {
    return Response.json({
      error: "Reply can't be empty"
    }, {
      status: 400
    });
  }
  if (text.length > 5e3) {
    return Response.json({
      error: "Reply too long (5000 max)"
    }, {
      status: 400
    });
  }
  const tRes = await db.execute(sql`
    SELECT id, user_email, user_name FROM tickets WHERE id = ${id} LIMIT 1
  `);
  const ticket = tRes.rows[0];
  if (!ticket) {
    return Response.json({
      error: "Not found"
    }, {
      status: 404
    });
  }
  const mRes = await db.execute(sql`
    INSERT INTO ticket_messages (ticket_id, author_type, author_id, author_email, body)
    VALUES (${id}, 'admin', ${user.id}, ${adminEmail}, ${text})
    RETURNING id, ticket_id, author_type, author_email, body, created_at
  `);
  await db.execute(sql`
    UPDATE tickets
    SET updated_at = NOW(),
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
    WHERE id = ${id}
  `);
  notifyUserOfReply({
    ticket_id: id,
    user_email: ticket.user_email,
    user_name: ticket.user_name,
    admin_name: adminName,
    reply_body: text
  });
  return Response.json({
    message: mRes.rows[0]
  });
}
const route30 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
function meta$5({}) {
  return [{
    title: "Free Call Signups – Admin Panel"
  }];
}
const consultationSignups = UNSAFE_withComponentProps(function ConsultationSignups() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [signups, setSignups] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (isPending || !isAuthorized) return;
    const fetchSignups = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/consultation-signups", {
          headers: {
            Authorization: `Bearer ${token}`
          },
          credentials: "include"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSignups(data.signups || []);
        setStats(data.stats || null);
      } catch (e) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    fetchSignups();
  }, [isPending, isAuthorized]);
  const fmt2 = (iso) => new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  if (isPending) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-[#F5F5F0]",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-6",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "text-2xl font-bold text-gray-900",
          style: {
            fontFamily: "Clash Display, sans-serif"
          },
          children: "Free Call Signups"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-sm text-gray-500 mt-1",
          children: "Students who requested a free 1:1 internship strategy call."
        })]
      }), stats && /* @__PURE__ */ jsx("div", {
        className: "grid grid-cols-3 gap-4 mb-6",
        children: [{
          label: "Total",
          value: stats.total
        }, {
          label: "Last 7 days",
          value: stats.last_7_days
        }, {
          label: "Last 30 days",
          value: stats.last_30_days
        }].map((s) => /* @__PURE__ */ jsxs("div", {
          className: "bg-white rounded-2xl border border-gray-200 p-5 shadow-sm",
          children: [/* @__PURE__ */ jsx("p", {
            className: "text-xs font-medium text-gray-500 uppercase tracking-wide",
            children: s.label
          }), /* @__PURE__ */ jsx("p", {
            className: "text-3xl font-bold text-gray-900 mt-1",
            children: s.value
          })]
        }, s.label))
      }), error && /* @__PURE__ */ jsx("div", {
        className: "mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700",
        children: error
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "text-center py-16 text-gray-400 text-sm",
        children: "Loading…"
      }) : signups.length === 0 ? /* @__PURE__ */ jsx("div", {
        className: "bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm",
        children: "No signups yet."
      }) : /* @__PURE__ */ jsx("div", {
        className: "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden",
        children: /* @__PURE__ */ jsxs("table", {
          className: "w-full text-sm",
          children: [/* @__PURE__ */ jsx("thead", {
            className: "bg-gray-50 border-b border-gray-200",
            children: /* @__PURE__ */ jsx("tr", {
              children: ["#", "Date", "Email", "Target Role", "Biggest Challenge", "Timeline"].map((h) => /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide",
                children: h
              }, h))
            })
          }), /* @__PURE__ */ jsx("tbody", {
            className: "divide-y divide-gray-100",
            children: signups.map((s) => /* @__PURE__ */ jsxs("tr", {
              className: "hover:bg-gray-50",
              children: [/* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-400 font-mono text-xs",
                children: s.id
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-500 whitespace-nowrap text-xs",
                children: fmt2(s.created_at)
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: s.email ?? /* @__PURE__ */ jsx("span", {
                  className: "text-gray-400 italic",
                  children: "not signed in"
                })
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: s.target_role
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: s.biggest_challenge
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: /* @__PURE__ */ jsx("span", {
                  className: "inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200",
                  children: s.timeline
                })
              })]
            }, s.id))
          })]
        })
      })]
    })]
  });
});
const route31 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: consultationSignups,
  meta: meta$5
}, Symbol.toStringTag, { value: "Module" }));
async function loader$6({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    });
  }
  const roleResult = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = roleResult.rows[0]?.role;
  if (role !== "admin" && role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const [rows, statsResult] = await Promise.all([db.execute(sql`
      SELECT id, user_id, email, target_role, biggest_challenge, timeline, created_at
      FROM consultation_signups
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `), db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7_days,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last_30_days
      FROM consultation_signups
    `)]);
  return Response.json({
    signups: rows.rows,
    stats: statsResult.rows[0],
    limit,
    offset
  });
}
const route32 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);
function meta$4(_) {
  return [{
    title: "Analytics — Studojo Admin"
  }];
}
async function phQuery$1(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      query
    })
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}
async function phGet(type, params = {}) {
  const qs = new URLSearchParams({
    type,
    ...params
  }).toString();
  const res = await fetch(`/api/posthog?${qs}`, {
    credentials: "include"
  });
  if (!res.ok) throw new Error(`PostHog ${type} failed: ${res.status}`);
  return res.json();
}
function isoDate(d) {
  return d.toISOString().split("T")[0];
}
function daysAgo(n) {
  return isoDate(new Date(Date.now() - n * 864e5));
}
function eventsFilter(start, end) {
  return `toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'`;
}
function fmtDuration(secs) {
  if (!secs) return "0s";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return `${Math.floor(diff / 6e4)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const chartOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: "rgba(0,0,0,0.85)",
      padding: 10,
      titleFont: {
        family: "'Satoshi', sans-serif",
        size: 13,
        weight: "bold"
      },
      bodyFont: {
        family: "'Satoshi', sans-serif",
        size: 12
      },
      borderColor: "#171717",
      borderWidth: 1,
      cornerRadius: 6
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      },
      ticks: {
        font: {
          family: "'Satoshi', sans-serif",
          size: 11
        },
        color: "#6b7280"
      },
      border: {
        color: "#e5e7eb"
      }
    },
    y: {
      grid: {
        color: "#f3f4f6"
      },
      ticks: {
        font: {
          family: "'Satoshi', sans-serif",
          size: 11
        },
        color: "#6b7280"
      },
      border: {
        color: "#e5e7eb"
      },
      beginAtZero: true
    }
  }
};
const TABS = [{
  id: "overview",
  label: "Overview"
}, {
  id: "funnels",
  label: "Funnels"
}, {
  id: "sessions",
  label: "Sessions"
}, {
  id: "users",
  label: "User Profiles"
}, {
  id: "cohorts",
  label: "Cohorts"
}];
const analytics = UNSAFE_withComponentProps(function Analytics() {
  const {
    isAuthorized
  } = useAdminGuard();
  const [tab, setTab] = useState("overview");
  const [preset, setPreset] = useState("30d");
  const [startDate, setStartDate] = useState(() => daysAgo(30));
  const [endDate, setEndDate] = useState(() => isoDate(/* @__PURE__ */ new Date()));
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState(endDate);
  function applyPreset(days, p) {
    const s = daysAgo(days);
    const e = isoDate(/* @__PURE__ */ new Date());
    setStartDate(s);
    setEndDate(e);
    setPendingStart(s);
    setPendingEnd(e);
    setPreset(p);
  }
  function applyCustom() {
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
    setPreset("custom");
  }
  const [stats, setStats] = useState(null);
  const [daily, setDaily] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [funnelA, setFunnelA] = useState([]);
  const [funnelB, setFunnelB] = useState([]);
  const [funnelC, setFunnelC] = useState([]);
  const [funnelsLoading, setFunnelsLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [minDuration, setMinDuration] = useState("");
  const [persons, setPersons] = useState([]);
  const [personsTotal, setPersonsTotal] = useState(0);
  const [personSearch, setPersonSearch] = useState("");
  const [personsLoading, setPersonsLoading] = useState(false);
  const [expandedPerson, setExpandedPerson] = useState(null);
  const [personEvents, setPersonEvents] = useState({});
  const [cohorts, setCohorts] = useState([]);
  const [cohortsLoading, setCohortsLoading] = useState(false);
  const [expandedCohort, setExpandedCohort] = useState(null);
  const [cohortPersons, setCohortPersons] = useState({});
  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    const ef = eventsFilter(startDate, endDate);
    async function safeQuery(query) {
      try {
        return await phQuery$1(query);
      } catch {
        return null;
      }
    }
    try {
      const token = await getToken();
      const [statsRes, signupsRes, dailyEventsRes, , topRes] = await Promise.all([
        // Visitors, payments, campaigns from events
        safeQuery({
          kind: "HogQLQuery",
          query: `SELECT uniq(person_id) as visitors, countIf(event = 'payment_confirmed') as payments, countIf(event = 'campaign_started') as campaigns FROM events WHERE ${ef}`
        }),
        // Total new signups + daily breakdown — via server-side proxy (avoids CORS)
        fetch(`/api/analytics?start=${startDate}&end=${endDate}`, {
          credentials: "include",
          headers: token ? {
            Authorization: `Bearer ${token}`
          } : {}
        }).then((r) => r.ok ? r.json() : {
          count: 0,
          daily: []
        }).catch(() => ({
          count: 0,
          daily: []
        })),
        // Daily visitors/payments/campaigns
        safeQuery({
          kind: "HogQLQuery",
          query: `SELECT toDate(timestamp) as day, uniqIf(person_id, event = '$pageview') as visitors, countIf(event = 'payment_confirmed') as payments, countIf(event = 'campaign_started') as campaigns FROM events WHERE ${ef} GROUP BY day ORDER BY day ASC`
        }),
        // (signups daily comes bundled in the signups_count response above)
        Promise.resolve(null),
        // Top pages — use full expression in WHERE, not alias
        safeQuery({
          kind: "HogQLQuery",
          query: `SELECT properties.$current_url as url, count() as views FROM events WHERE event = '$pageview' AND ${ef} AND properties.$current_url IS NOT NULL AND properties.$current_url != '' GROUP BY url ORDER BY views DESC LIMIT 10`
        })
      ]);
      const row = statsRes?.results?.[0] ?? [0, 0, 0];
      const signupCount = signupsRes?.count ?? 0;
      setStats({
        visitors: row[0] ?? 0,
        signups: signupCount,
        payments: row[1] ?? 0,
        campaigns: row[2] ?? 0
      });
      const eventsMap = {};
      for (const r of dailyEventsRes?.results ?? []) {
        const day = String(r[0]).split("T")[0];
        eventsMap[day] = {
          visitors: r[1] ?? 0,
          payments: r[2] ?? 0,
          campaigns: r[3] ?? 0
        };
      }
      const signupsMap = {};
      for (const r of signupsRes?.daily ?? []) {
        signupsMap[String(r.day).split("T")[0]] = r.signups ?? 0;
      }
      const allDays = Array.from(/* @__PURE__ */ new Set([...Object.keys(eventsMap), ...Object.keys(signupsMap)])).sort();
      setDaily(allDays.map((day) => ({
        day,
        visitors: eventsMap[day]?.visitors ?? 0,
        signups: signupsMap[day] ?? 0,
        payments: eventsMap[day]?.payments ?? 0,
        campaigns: eventsMap[day]?.campaigns ?? 0
      })));
      setTopPages((topRes?.results ?? []).map((r) => ({
        url: String(r[0] ?? "").replace(/^https?:\/\/[^/]+/, "") || "/",
        views: r[1] ?? 0
      })));
    } catch (e) {
      toast$1.error("Failed to load overview: " + e.message);
    } finally {
      setOverviewLoading(false);
    }
  }, [startDate, endDate]);
  const loadFunnels = useCallback(async () => {
    setFunnelsLoading(true);
    const ef = eventsFilter(startDate, endDate);
    async function computeFunnel(steps) {
      const selects = steps.map((s) => `uniqIf(person_id, event = '${s.event}') as step_${steps.indexOf(s)}`).join(", ");
      const res = await phQuery$1({
        kind: "HogQLQuery",
        query: `SELECT ${selects} FROM events WHERE ${ef}`
      });
      const row = res?.results?.[0] ?? steps.map(() => 0);
      const first = row[0] ?? 1;
      return steps.map((s, i) => ({
        name: s.name,
        event: s.event,
        count: row[i] ?? 0,
        pct_from_start: first > 0 ? Math.round((row[i] ?? 0) / first * 100) : 0,
        pct_from_prev: i === 0 ? 100 : (row[i - 1] ?? 0) > 0 ? Math.round((row[i] ?? 0) / (row[i - 1] ?? 1) * 100) : 0
      }));
    }
    try {
      const [a, b, c] = await Promise.all([computeFunnel([{
        name: "Page View",
        event: "$pageview"
      }, {
        name: "Resume Uploaded",
        event: "resume_uploaded"
      }, {
        name: "Payment Confirmed",
        event: "payment_confirmed"
      }, {
        name: "Campaign Started",
        event: "campaign_started"
      }, {
        name: "Email Sent",
        event: "email_sent"
      }]), computeFunnel([{
        name: "Resume Uploaded",
        event: "resume_uploaded"
      }, {
        name: "Quiz Completed",
        event: "profile_quiz_completed"
      }, {
        name: "Payment Confirmed",
        event: "payment_confirmed"
      }]), computeFunnel([{
        name: "Payment Confirmed",
        event: "payment_confirmed"
      }, {
        name: "Leads Discovered",
        event: "lead_discovery_completed"
      }, {
        name: "Enrichment Done",
        event: "enrichment_completed"
      }, {
        name: "Gmail Connected",
        event: "gmail_connected"
      }, {
        name: "Campaign Started",
        event: "campaign_started"
      }])]);
      setFunnelA(a);
      setFunnelB(b);
      setFunnelC(c);
    } catch (e) {
      toast$1.error("Failed to load funnels: " + e.message);
    } finally {
      setFunnelsLoading(false);
    }
  }, [startDate, endDate]);
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const params = {
        limit: "20",
        offset: String(sessionsOffset)
      };
      if (minDuration) params.min_duration = minDuration;
      const data = await phGet("sessions", params);
      setSessions(data.results ?? []);
      setSessionsTotal(data.count ?? 0);
    } catch (e) {
      toast$1.error("Failed to load sessions: " + e.message);
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionsOffset, minDuration]);
  const loadPersons = useCallback(async () => {
    setPersonsLoading(true);
    try {
      const params = {
        limit: "50",
        offset: "0"
      };
      if (personSearch) params.search = personSearch;
      const data = await phGet("persons", params);
      setPersons(data.results ?? []);
      setPersonsTotal(data.count ?? 0);
    } catch (e) {
      toast$1.error("Failed to load users: " + e.message);
    } finally {
      setPersonsLoading(false);
    }
  }, [personSearch]);
  const loadCohorts = useCallback(async () => {
    setCohortsLoading(true);
    try {
      const data = await phGet("cohorts");
      setCohorts(data.results ?? []);
    } catch (e) {
      toast$1.error("Failed to load cohorts: " + e.message);
    } finally {
      setCohortsLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "overview") loadOverview();
  }, [isAuthorized, tab, startDate, endDate, loadOverview]);
  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "funnels") loadFunnels();
  }, [isAuthorized, tab, startDate, endDate, loadFunnels]);
  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "sessions") loadSessions();
  }, [isAuthorized, tab, sessionsOffset, minDuration, loadSessions]);
  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "users") loadPersons();
  }, [isAuthorized, tab, personSearch, loadPersons]);
  useEffect(() => {
    if (!isAuthorized) return;
    if (tab === "cohorts") loadCohorts();
  }, [isAuthorized, tab, loadCohorts]);
  async function togglePerson(uuid) {
    if (expandedPerson === uuid) {
      setExpandedPerson(null);
      return;
    }
    setExpandedPerson(uuid);
    if (personEvents[uuid]) return;
    try {
      const data = await phGet("person_events", {
        person_id: uuid
      });
      setPersonEvents((prev) => ({
        ...prev,
        [uuid]: data.results ?? []
      }));
    } catch {
    }
  }
  async function toggleCohort(id) {
    if (expandedCohort === id) {
      setExpandedCohort(null);
      return;
    }
    setExpandedCohort(id);
    if (cohortPersons[id]) return;
    try {
      const data = await phGet("cohort_persons", {
        cohort_id: String(id)
      });
      setCohortPersons((prev) => ({
        ...prev,
        [id]: data.results ?? []
      }));
    } catch {
    }
  }
  function exportCohortEmails(id) {
    const people = cohortPersons[id] ?? [];
    const emails = people.map((p) => p.properties?.email ?? p.distinct_ids?.[0] ?? "").filter(Boolean).join(", ");
    if (!emails) {
      toast$1.error("No emails found — expand cohort first");
      return;
    }
    navigator.clipboard.writeText(emails).then(() => toast$1.success("Emails copied to clipboard!"));
  }
  const dailyLabels = daily.map((d) => d.day.slice(5));
  const visitorsChart = {
    labels: dailyLabels,
    datasets: [{
      label: "Visitors",
      data: daily.map((d) => d.visitors),
      borderColor: "#8b5cf6",
      backgroundColor: "rgba(139,92,246,0.12)",
      borderWidth: 2,
      fill: true,
      tension: 0.15,
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBackgroundColor: "#8b5cf6",
      pointBorderColor: "#fff",
      pointBorderWidth: 2
    }, {
      label: "Signups",
      data: daily.map((d) => d.signups),
      borderColor: "#10b981",
      backgroundColor: "rgba(16,185,129,0.08)",
      borderWidth: 2,
      fill: true,
      tension: 0.15,
      pointRadius: 4,
      pointHoverRadius: 5,
      pointBackgroundColor: "#10b981",
      pointBorderColor: "#fff",
      pointBorderWidth: 2
    }]
  };
  const paymentsChart = {
    labels: dailyLabels,
    datasets: [{
      label: "Payments",
      data: daily.map((d) => d.payments),
      backgroundColor: "rgba(245,158,11,0.8)",
      borderColor: "#f59e0b",
      borderWidth: 2,
      borderRadius: 4
    }, {
      label: "Campaigns",
      data: daily.map((d) => d.campaigns),
      backgroundColor: "rgba(6,182,212,0.8)",
      borderColor: "#06b6d4",
      borderWidth: 2,
      borderRadius: 4
    }]
  };
  if (!isAuthorized) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsx("p", {
        className: "font-['Satoshi'] text-neutral-500",
        children: "Checking access…"
      })
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-6 flex flex-wrap items-center justify-between gap-4",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Clash_Display'] text-2xl font-semibold text-neutral-900",
            children: "Analytics"
          }), /* @__PURE__ */ jsx("p", {
            className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
            children: "Behavioural data powered by PostHog"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex flex-wrap items-center gap-2",
          children: [["7d", "30d", "90d"].map((p) => /* @__PURE__ */ jsx("button", {
            onClick: () => applyPreset(p === "7d" ? 7 : p === "30d" ? 30 : 90, p),
            className: `rounded-lg border-2 border-neutral-900 px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${preset === p ? "bg-violet-500 text-white" : "bg-white text-neutral-900"}`,
            children: p
          }, p)), /* @__PURE__ */ jsxs("div", {
            className: "flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("input", {
              type: "date",
              value: pendingStart,
              max: pendingEnd,
              onChange: (e) => {
                setPendingStart(e.target.value);
                setPreset("custom");
              },
              className: "font-['Satoshi'] text-sm text-neutral-900 outline-none"
            }), /* @__PURE__ */ jsx("span", {
              className: "text-neutral-400",
              children: "→"
            }), /* @__PURE__ */ jsx("input", {
              type: "date",
              value: pendingEnd,
              min: pendingStart,
              max: isoDate(/* @__PURE__ */ new Date()),
              onChange: (e) => {
                setPendingEnd(e.target.value);
                setPreset("custom");
              },
              className: "font-['Satoshi'] text-sm text-neutral-900 outline-none"
            }), preset === "custom" && /* @__PURE__ */ jsx("button", {
              onClick: applyCustom,
              className: "ml-1 rounded-md bg-violet-500 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-white",
              children: "Apply"
            })]
          })]
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "mb-6 flex gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: TABS.map((t) => /* @__PURE__ */ jsx("button", {
          onClick: () => setTab(t.id),
          className: `flex-1 rounded-lg px-3 py-2 font-['Satoshi'] text-sm font-medium transition-colors ${tab === t.id ? "bg-violet-500 text-white shadow-sm" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"}`,
          children: t.label
        }, t.id))
      }), tab === "overview" && /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.2
        },
        children: overviewLoading ? /* @__PURE__ */ jsx(Spinner, {}) : /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsxs("div", {
            className: "mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4",
            children: [/* @__PURE__ */ jsx(StatCard$1, {
              label: "Unique Visitors",
              value: stats?.visitors ?? 0,
              color: "violet"
            }), /* @__PURE__ */ jsx(StatCard$1, {
              label: "New Signups",
              value: stats?.signups ?? 0,
              color: "emerald"
            }), /* @__PURE__ */ jsx(StatCard$1, {
              label: "Payments",
              value: stats?.payments ?? 0,
              color: "amber"
            }), /* @__PURE__ */ jsx(StatCard$1, {
              label: "Campaigns Started",
              value: stats?.campaigns ?? 0,
              color: "cyan"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "mb-6 grid gap-4 lg:grid-cols-2",
            children: [/* @__PURE__ */ jsx(ChartCard, {
              title: "Daily Visitors vs Signups",
              children: /* @__PURE__ */ jsx(Line, {
                data: visitorsChart,
                options: {
                  ...chartOpts,
                  plugins: {
                    ...chartOpts.plugins,
                    legend: {
                      display: true,
                      position: "top",
                      labels: {
                        font: {
                          family: "'Satoshi', sans-serif",
                          size: 12
                        },
                        usePointStyle: true,
                        padding: 12
                      }
                    }
                  }
                }
              })
            }), /* @__PURE__ */ jsx(ChartCard, {
              title: "Daily Payments & Campaigns",
              children: /* @__PURE__ */ jsx(Bar, {
                data: paymentsChart,
                options: {
                  ...chartOpts,
                  plugins: {
                    ...chartOpts.plugins,
                    legend: {
                      display: true,
                      position: "top",
                      labels: {
                        font: {
                          family: "'Satoshi', sans-serif",
                          size: 12
                        },
                        usePointStyle: true,
                        padding: 12
                      }
                    }
                  }
                }
              })
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("div", {
              className: "border-b-2 border-neutral-900 px-6 py-4",
              children: /* @__PURE__ */ jsx("h2", {
                className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
                children: "Top Pages"
              })
            }), /* @__PURE__ */ jsx("div", {
              className: "overflow-x-auto",
              children: /* @__PURE__ */ jsxs("table", {
                className: "w-full",
                children: [/* @__PURE__ */ jsx("thead", {
                  children: /* @__PURE__ */ jsxs("tr", {
                    className: "border-b border-neutral-200 bg-neutral-50",
                    children: [/* @__PURE__ */ jsx("th", {
                      className: "px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                      children: "Page"
                    }), /* @__PURE__ */ jsx("th", {
                      className: "px-6 py-3 text-right font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                      children: "Views"
                    })]
                  })
                }), /* @__PURE__ */ jsxs("tbody", {
                  children: [topPages.map((p, i) => /* @__PURE__ */ jsxs("tr", {
                    className: "border-b border-neutral-100 hover:bg-neutral-50",
                    children: [/* @__PURE__ */ jsx("td", {
                      className: "px-6 py-3 font-['Satoshi'] text-sm text-neutral-700 font-mono",
                      children: p.url
                    }), /* @__PURE__ */ jsx("td", {
                      className: "px-6 py-3 text-right font-['Satoshi'] text-sm font-semibold text-neutral-900",
                      children: p.views.toLocaleString()
                    })]
                  }, i)), topPages.length === 0 && /* @__PURE__ */ jsx("tr", {
                    children: /* @__PURE__ */ jsx("td", {
                      colSpan: 2,
                      className: "px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400",
                      children: "No data yet — events will appear once users visit the site"
                    })
                  })]
                })]
              })
            })]
          })]
        })
      }), tab === "funnels" && /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.2
        },
        children: funnelsLoading ? /* @__PURE__ */ jsx(Spinner, {}) : /* @__PURE__ */ jsxs("div", {
          className: "space-y-6",
          children: [/* @__PURE__ */ jsx(FunnelChart, {
            title: "Full Product Funnel",
            subtitle: "Visitor → Email Sent — where are people dropping off?",
            steps: funnelA
          }), /* @__PURE__ */ jsx(FunnelChart, {
            title: "Onboarding Funnel",
            subtitle: "Resume upload → payment — biggest leak in your onboarding",
            steps: funnelB
          }), /* @__PURE__ */ jsx(FunnelChart, {
            title: "Post-Payment Activation",
            subtitle: "Of people who paid, who actually launched a campaign?",
            steps: funnelC
          })]
        })
      }), tab === "sessions" && /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.2
        },
        children: [/* @__PURE__ */ jsxs("div", {
          className: "mb-4 flex flex-wrap items-center gap-3",
          children: [/* @__PURE__ */ jsx("span", {
            className: "font-['Satoshi'] text-sm text-neutral-500",
            children: "Min duration:"
          }), [{
            label: "Any",
            value: ""
          }, {
            label: "> 30s",
            value: "30"
          }, {
            label: "> 1 min",
            value: "60"
          }, {
            label: "> 3 min",
            value: "180"
          }].map((opt) => /* @__PURE__ */ jsx("button", {
            onClick: () => {
              setMinDuration(opt.value);
              setSessionsOffset(0);
            },
            className: `rounded-lg border-2 border-neutral-900 px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${minDuration === opt.value ? "bg-violet-500 text-white" : "bg-white text-neutral-700"}`,
            children: opt.label
          }, opt.value))]
        }), /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "border-b-2 border-neutral-900 px-6 py-4",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
              children: "Session Recordings"
            }), /* @__PURE__ */ jsx("p", {
              className: "mt-0.5 font-['Satoshi'] text-xs text-neutral-500",
              children: 'Click "Watch" to open the full replay in PostHog'
            })]
          }), sessionsLoading ? /* @__PURE__ */ jsx("div", {
            className: "flex justify-center py-12",
            children: /* @__PURE__ */ jsx(Spinner, {
              inline: true
            })
          }) : /* @__PURE__ */ jsx("div", {
            className: "overflow-x-auto",
            children: /* @__PURE__ */ jsxs("table", {
              className: "w-full",
              children: [/* @__PURE__ */ jsx("thead", {
                children: /* @__PURE__ */ jsxs("tr", {
                  className: "border-b border-neutral-200 bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("th", {
                    className: "px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                    children: "Person"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                    children: "Duration"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                    children: "Clicks"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                    children: "Active"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-6 py-3 text-left font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                    children: "Time"
                  }), /* @__PURE__ */ jsx("th", {
                    className: "px-6 py-3 text-right font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500",
                    children: "Replay"
                  })]
                })
              }), /* @__PURE__ */ jsxs("tbody", {
                children: [sessions.map((s) => /* @__PURE__ */ jsxs("tr", {
                  className: "border-b border-neutral-100 hover:bg-neutral-50",
                  children: [/* @__PURE__ */ jsx("td", {
                    className: "px-6 py-3 font-['Satoshi'] text-sm text-neutral-800",
                    children: s.person?.properties?.email ?? s.person?.name ?? "Anonymous"
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-6 py-3 font-['Satoshi'] text-sm text-neutral-600",
                    children: fmtDuration(s.recording_duration)
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-6 py-3 font-['Satoshi'] text-sm text-neutral-600",
                    children: s.click_count ?? 0
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-6 py-3 font-['Satoshi'] text-sm text-neutral-600",
                    children: fmtDuration(s.active_seconds)
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-6 py-3 font-['Satoshi'] text-sm text-neutral-500",
                    children: timeAgo(s.start_time)
                  }), /* @__PURE__ */ jsx("td", {
                    className: "px-6 py-3 text-right",
                    children: /* @__PURE__ */ jsx("a", {
                      href: `https://eu.posthog.com/project/150589/replay/${s.id}`,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "inline-flex items-center gap-1 rounded-lg border-2 border-neutral-900 bg-violet-500 px-3 py-1 font-['Satoshi'] text-xs font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none",
                      children: "Watch →"
                    })
                  })]
                }, s.id)), sessions.length === 0 && /* @__PURE__ */ jsx("tr", {
                  children: /* @__PURE__ */ jsx("td", {
                    colSpan: 6,
                    className: "px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400",
                    children: "No sessions found"
                  })
                })]
              })]
            })
          }), sessionsTotal > 20 && /* @__PURE__ */ jsxs("div", {
            className: "flex items-center justify-between border-t border-neutral-200 px-6 py-4",
            children: [/* @__PURE__ */ jsxs("p", {
              className: "font-['Satoshi'] text-sm text-neutral-500",
              children: [sessionsOffset + 1, "–", Math.min(sessionsOffset + 20, sessionsTotal), " of ", sessionsTotal]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex gap-2",
              children: [/* @__PURE__ */ jsx("button", {
                onClick: () => setSessionsOffset(Math.max(0, sessionsOffset - 20)),
                disabled: sessionsOffset === 0,
                className: "rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40 transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0",
                children: "Previous"
              }), /* @__PURE__ */ jsx("button", {
                onClick: () => setSessionsOffset(sessionsOffset + 20),
                disabled: sessionsOffset + 20 >= sessionsTotal,
                className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40 transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0",
                children: "Next"
              })]
            })]
          })]
        })]
      }), tab === "users" && /* @__PURE__ */ jsxs(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.2
        },
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-4",
          children: /* @__PURE__ */ jsx("input", {
            type: "text",
            placeholder: "Search by email or name…",
            value: personSearch,
            onChange: (e) => setPersonSearch(e.target.value),
            className: "w-full max-w-sm rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] outline-none focus:border-violet-500"
          })
        }), /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "border-b-2 border-neutral-900 px-6 py-4",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
              children: "User Profiles"
            }), personsTotal > 0 && /* @__PURE__ */ jsxs("p", {
              className: "mt-0.5 font-['Satoshi'] text-xs text-neutral-500",
              children: [personsTotal.toLocaleString(), " total persons"]
            })]
          }), personsLoading ? /* @__PURE__ */ jsx("div", {
            className: "flex justify-center py-12",
            children: /* @__PURE__ */ jsx(Spinner, {
              inline: true
            })
          }) : /* @__PURE__ */ jsxs("div", {
            children: [persons.map((p) => {
              const email = p.properties?.email ?? p.distinct_ids?.[0] ?? "Unknown";
              const paid = p.properties?.total_paid_cents > 0;
              const isExpanded = expandedPerson === p.uuid;
              return /* @__PURE__ */ jsxs("div", {
                className: "border-b border-neutral-100 last:border-0",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "flex cursor-pointer items-center gap-4 px-6 py-4 hover:bg-neutral-50",
                  onClick: () => togglePerson(p.uuid),
                  children: [/* @__PURE__ */ jsxs("div", {
                    className: "flex-1 min-w-0",
                    children: [/* @__PURE__ */ jsx("p", {
                      className: "truncate font-['Satoshi'] text-sm font-semibold text-neutral-900",
                      children: email
                    }), /* @__PURE__ */ jsxs("p", {
                      className: "font-['Satoshi'] text-xs text-neutral-400",
                      children: ["First seen ", new Date(p.created_at).toLocaleDateString(), " · ID ", p.uuid.slice(0, 8)]
                    })]
                  }), paid && /* @__PURE__ */ jsx("span", {
                    className: "shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-emerald-700",
                    children: "Paid"
                  }), /* @__PURE__ */ jsx("a", {
                    href: `https://eu.posthog.com/project/150589/person/${p.uuid}`,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    onClick: (e) => e.stopPropagation(),
                    className: "shrink-0 rounded-lg border border-neutral-300 bg-white px-2 py-1 font-['Satoshi'] text-xs text-neutral-600 hover:border-violet-400 hover:text-violet-600",
                    children: "PostHog ↗"
                  }), /* @__PURE__ */ jsx("span", {
                    className: "shrink-0 text-neutral-400",
                    children: isExpanded ? "▲" : "▼"
                  })]
                }), /* @__PURE__ */ jsx(AnimatePresence, {
                  children: isExpanded && /* @__PURE__ */ jsx(motion.div, {
                    initial: {
                      height: 0,
                      opacity: 0
                    },
                    animate: {
                      height: "auto",
                      opacity: 1
                    },
                    exit: {
                      height: 0,
                      opacity: 0
                    },
                    transition: {
                      duration: 0.15
                    },
                    className: "overflow-hidden",
                    children: /* @__PURE__ */ jsxs("div", {
                      className: "border-t border-neutral-100 bg-neutral-50 px-6 py-4",
                      children: [/* @__PURE__ */ jsx("p", {
                        className: "mb-2 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-400",
                        children: "Recent Activity (last 15 events)"
                      }), personEvents[p.uuid] ? personEvents[p.uuid].length > 0 ? /* @__PURE__ */ jsx("div", {
                        className: "space-y-1.5",
                        children: personEvents[p.uuid].map((ev, i) => /* @__PURE__ */ jsx(EventRow, {
                          ev
                        }, i))
                      }) : /* @__PURE__ */ jsx("p", {
                        className: "font-['Satoshi'] text-xs text-neutral-400",
                        children: "No events found"
                      }) : /* @__PURE__ */ jsx("p", {
                        className: "font-['Satoshi'] text-xs text-neutral-400",
                        children: "Loading events…"
                      })]
                    })
                  })
                })]
              }, p.uuid);
            }), persons.length === 0 && /* @__PURE__ */ jsx("p", {
              className: "px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400",
              children: "No users found"
            })]
          })]
        })]
      }), tab === "cohorts" && /* @__PURE__ */ jsx(motion.div, {
        initial: {
          opacity: 0,
          y: 8
        },
        animate: {
          opacity: 1,
          y: 0
        },
        transition: {
          duration: 0.2
        },
        children: cohortsLoading ? /* @__PURE__ */ jsx(Spinner, {}) : /* @__PURE__ */ jsx("div", {
          className: "space-y-3",
          children: cohorts.length === 0 ? /* @__PURE__ */ jsx("div", {
            className: "rounded-xl border-2 border-neutral-900 bg-white px-6 py-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: /* @__PURE__ */ jsx("p", {
              className: "font-['Satoshi'] text-sm text-neutral-400",
              children: "No cohorts found. Create cohorts in PostHog → People & Groups → Cohorts."
            })
          }) : cohorts.map((c) => {
            const isExpanded = expandedCohort === c.id;
            return /* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex cursor-pointer items-center gap-4 px-6 py-4",
                onClick: () => toggleCohort(c.id),
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "flex-1",
                  children: [/* @__PURE__ */ jsx("p", {
                    className: "font-['Satoshi'] text-sm font-semibold text-neutral-900",
                    children: c.name
                  }), c.description && /* @__PURE__ */ jsx("p", {
                    className: "font-['Satoshi'] text-xs text-neutral-400",
                    children: c.description
                  })]
                }), /* @__PURE__ */ jsxs("span", {
                  className: "rounded-full bg-violet-100 px-3 py-1 font-['Satoshi'] text-sm font-bold text-violet-700",
                  children: [(c.count ?? 0).toLocaleString(), " users"]
                }), /* @__PURE__ */ jsx("button", {
                  onClick: (e) => {
                    e.stopPropagation();
                    exportCohortEmails(c.id);
                  },
                  className: "rounded-lg border-2 border-neutral-900 bg-amber-400 px-3 py-1 font-['Satoshi'] text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none",
                  children: "Export Emails"
                }), /* @__PURE__ */ jsx("span", {
                  className: "text-neutral-400",
                  children: isExpanded ? "▲" : "▼"
                })]
              }), /* @__PURE__ */ jsx(AnimatePresence, {
                children: isExpanded && /* @__PURE__ */ jsx(motion.div, {
                  initial: {
                    height: 0,
                    opacity: 0
                  },
                  animate: {
                    height: "auto",
                    opacity: 1
                  },
                  exit: {
                    height: 0,
                    opacity: 0
                  },
                  transition: {
                    duration: 0.15
                  },
                  className: "overflow-hidden",
                  children: /* @__PURE__ */ jsxs("div", {
                    className: "border-t-2 border-neutral-200 bg-neutral-50 px-6 py-4",
                    children: [/* @__PURE__ */ jsx("p", {
                      className: "mb-2 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-400",
                      children: "Sample Users (top 10)"
                    }), cohortPersons[c.id] ? cohortPersons[c.id].length > 0 ? /* @__PURE__ */ jsx("div", {
                      className: "space-y-1",
                      children: cohortPersons[c.id].map((p) => /* @__PURE__ */ jsxs("div", {
                        className: "flex items-center gap-3",
                        children: [/* @__PURE__ */ jsx("span", {
                          className: "font-['Satoshi'] text-sm text-neutral-700",
                          children: p.properties?.email ?? p.distinct_ids?.[0] ?? p.uuid.slice(0, 8)
                        }), /* @__PURE__ */ jsx("a", {
                          href: `https://eu.posthog.com/project/150589/person/${p.uuid}`,
                          target: "_blank",
                          rel: "noopener noreferrer",
                          className: "font-['Satoshi'] text-xs text-violet-500 hover:underline",
                          children: "View ↗"
                        })]
                      }, p.uuid))
                    }) : /* @__PURE__ */ jsx("p", {
                      className: "font-['Satoshi'] text-xs text-neutral-400",
                      children: "No users found in this cohort"
                    }) : /* @__PURE__ */ jsx("p", {
                      className: "font-['Satoshi'] text-xs text-neutral-400",
                      children: "Loading…"
                    })]
                  })
                })
              })]
            }, c.id);
          })
        })
      })]
    })]
  });
});
function StatCard$1({
  label,
  value,
  color
}) {
  const colors = {
    violet: "bg-violet-50 border-violet-200 text-violet-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    cyan: "bg-cyan-50 border-cyan-200 text-cyan-700"
  };
  return /* @__PURE__ */ jsxs("div", {
    className: `rounded-xl border-2 border-neutral-900 bg-white p-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]`,
    children: [/* @__PURE__ */ jsx("p", {
      className: "font-['Satoshi'] text-xs font-medium uppercase tracking-wide text-neutral-400",
      children: label
    }), /* @__PURE__ */ jsx("p", {
      className: `mt-1 font-['Clash_Display'] text-3xl font-bold ${colors[color].split(" ")[2]}`,
      children: value.toLocaleString()
    })]
  });
}
function ChartCard({
  title,
  children
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
    children: [/* @__PURE__ */ jsx("div", {
      className: "border-b-2 border-neutral-900 px-6 py-4",
      children: /* @__PURE__ */ jsx("h2", {
        className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
        children: title
      })
    }), /* @__PURE__ */ jsx("div", {
      className: "p-6",
      style: {
        height: 260
      },
      children
    })]
  });
}
function FunnelChart({
  title,
  subtitle,
  steps
}) {
  if (steps.length === 0) return null;
  const max = steps[0]?.count || 1;
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "border-b-2 border-neutral-900 px-6 py-4",
      children: [/* @__PURE__ */ jsx("h2", {
        className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
        children: title
      }), /* @__PURE__ */ jsx("p", {
        className: "mt-0.5 font-['Satoshi'] text-xs text-neutral-400",
        children: subtitle
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "p-6 space-y-4",
      children: [steps.map((s, i) => {
        const barWidth = max > 0 ? Math.max(4, Math.round(s.count / max * 100)) : 4;
        const isDrop = s.pct_from_prev < 50 && i > 0;
        return /* @__PURE__ */ jsxs("div", {
          className: "flex items-center gap-4",
          children: [/* @__PURE__ */ jsx("div", {
            className: "w-40 shrink-0 text-right font-['Satoshi'] text-sm text-neutral-600 truncate",
            children: s.name
          }), /* @__PURE__ */ jsx("div", {
            className: "flex-1 h-8 bg-neutral-100 rounded-lg overflow-hidden relative",
            children: /* @__PURE__ */ jsx("div", {
              className: `h-full rounded-lg transition-all duration-500 ${isDrop ? "bg-red-400" : "bg-violet-400"}`,
              style: {
                width: `${barWidth}%`
              }
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "w-24 shrink-0 text-right",
            children: [/* @__PURE__ */ jsx("span", {
              className: "font-['Satoshi'] text-sm font-bold text-neutral-900",
              children: s.count.toLocaleString()
            }), i > 0 && /* @__PURE__ */ jsxs("span", {
              className: `ml-2 font-['Satoshi'] text-xs font-semibold ${isDrop ? "text-red-500" : "text-emerald-500"}`,
              children: [s.pct_from_prev, "%"]
            })]
          })]
        }, i);
      }), /* @__PURE__ */ jsxs("p", {
        className: "font-['Satoshi'] text-xs text-neutral-400 pt-2",
        children: ["Overall conversion: ", steps[0]?.count > 0 ? Math.round(steps[steps.length - 1].count / steps[0].count * 100) : 0, "%  (", steps[0]?.count.toLocaleString(), " → ", steps[steps.length - 1]?.count.toLocaleString(), ")"]
      })]
    })]
  });
}
function EventRow({
  ev
}) {
  const [event, timestamp, pathname, currentUrl, fileType, tier, amountCents, campaignId, leadsFound, enrichedCount, emailAddress, errorType, couponCode] = ev;
  const labels = {
    "$pageview": {
      label: "Viewed page",
      color: "text-neutral-500 bg-neutral-100",
      detail: pathname || currentUrl?.replace(/^https?:\/\/[^/]+/, "") || ""
    },
    "$autocapture": {
      label: "Clicked something",
      color: "text-neutral-500 bg-neutral-100",
      detail: pathname || ""
    },
    "resume_uploaded": {
      label: "Uploaded resume",
      color: "text-blue-700 bg-blue-50",
      detail: fileType ? `type: ${fileType}` : ""
    },
    "profile_quiz_completed": {
      label: "Completed onboarding quiz",
      color: "text-blue-700 bg-blue-50"
    },
    "payment_order_created": {
      label: "Started checkout",
      color: "text-amber-700 bg-amber-50",
      detail: tier ? `tier: ${tier}` : ""
    },
    "coupon_applied": {
      label: "Applied coupon",
      color: "text-amber-700 bg-amber-50",
      detail: couponCode || ""
    },
    "payment_confirmed": {
      label: "Paid ✓",
      color: "text-emerald-700 bg-emerald-50",
      detail: [tier, amountCents ? `₹${Math.round(amountCents / 100)}` : ""].filter(Boolean).join(" · ")
    },
    "lead_discovery_started": {
      label: "Started lead search",
      color: "text-violet-700 bg-violet-50"
    },
    "lead_discovery_completed": {
      label: "Leads found",
      color: "text-violet-700 bg-violet-50",
      detail: leadsFound ? `${leadsFound} leads` : ""
    },
    "enrichment_started": {
      label: "Enrichment started",
      color: "text-violet-700 bg-violet-50"
    },
    "enrichment_completed": {
      label: "Enrichment done",
      color: "text-violet-700 bg-violet-50",
      detail: enrichedCount ? `${enrichedCount} enriched` : ""
    },
    "gmail_connected": {
      label: "Connected Gmail",
      color: "text-emerald-700 bg-emerald-50",
      detail: emailAddress || ""
    },
    "campaign_created": {
      label: "Created campaign",
      color: "text-cyan-700 bg-cyan-50"
    },
    "campaign_started": {
      label: "Launched campaign 🚀",
      color: "text-emerald-700 bg-emerald-50",
      detail: campaignId ? `campaign #${campaignId}` : ""
    },
    "campaign_cancelled": {
      label: "Cancelled campaign",
      color: "text-red-700 bg-red-50"
    },
    "test_launch_started": {
      label: "Ran test emails",
      color: "text-cyan-700 bg-cyan-50"
    },
    "email_sent": {
      label: "Email sent",
      color: "text-cyan-700 bg-cyan-50",
      detail: campaignId ? `campaign #${campaignId}` : ""
    },
    "email_failed": {
      label: "Email failed",
      color: "text-red-700 bg-red-50",
      detail: errorType || ""
    }
  };
  const meta2 = labels[event] ?? {
    label: event,
    color: "text-neutral-600 bg-neutral-100"
  };
  return /* @__PURE__ */ jsxs("div", {
    className: "flex items-start gap-3",
    children: [/* @__PURE__ */ jsx("span", {
      className: "w-32 shrink-0 font-['Satoshi'] text-xs text-neutral-400 mt-0.5",
      children: new Date(timestamp).toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    }), /* @__PURE__ */ jsxs("div", {
      className: "flex flex-wrap items-center gap-1.5",
      children: [/* @__PURE__ */ jsx("span", {
        className: `font-['Satoshi'] text-xs font-semibold px-2 py-0.5 rounded ${meta2.color}`,
        children: meta2.label
      }), meta2.detail && /* @__PURE__ */ jsx("span", {
        className: "font-['Satoshi'] text-xs text-neutral-500 font-mono",
        children: meta2.detail
      })]
    })]
  });
}
function Spinner({
  inline = false
}) {
  if (inline) {
    return /* @__PURE__ */ jsx("div", {
      className: "h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-violet-500"
    });
  }
  return /* @__PURE__ */ jsx("div", {
    className: "flex justify-center py-20",
    children: /* @__PURE__ */ jsx("div", {
      className: "h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-violet-500"
    })
  });
}
const route33 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: analytics,
  meta: meta$4
}, Symbol.toStringTag, { value: "Module" }));
function meta$3(_) {
  return [{
    title: "UTM Builder — Studojo Admin"
  }];
}
async function phQuery(query) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      query
    })
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}
const SOURCE_OPTIONS = ["email", "linkedin", "twitter", "whatsapp", "instagram", "youtube"];
const MEDIUM_OPTIONS = ["nurture", "cpc", "social", "organic", "direct", "referral"];
async function fetchCampaigns() {
  const token = await getToken();
  const res = await fetch("/api/utm-campaigns", {
    headers: token ? {
      Authorization: `Bearer ${token}`
    } : {},
    credentials: "include"
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.campaigns ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    url: buildUrl(c),
    created: c.created_at,
    utm_content: c.utm_content,
    utm_term: c.utm_term
  }));
}
function buildUrl(c) {
  try {
    const u = new URL(c.base_url);
    u.searchParams.set("utm_source", c.utm_source);
    u.searchParams.set("utm_medium", c.utm_medium);
    u.searchParams.set("utm_campaign", c.utm_campaign);
    if (c.utm_content) u.searchParams.set("utm_content", c.utm_content);
    if (c.utm_term) u.searchParams.set("utm_term", c.utm_term);
    return u.toString();
  } catch {
    return c.base_url;
  }
}
const utmBuilder = UNSAFE_withComponentProps(function UTMBuilder() {
  const {
    isAuthorized
  } = useAdminGuard();
  const [baseUrl, setBaseUrl] = useState("https://studojo.com/outreach");
  const [source2, setSource] = useState("email");
  const [customSource, setCustomSource] = useState("");
  const [medium, setMedium] = useState("nurture");
  const [customMedium, setCustomMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [stats, setStats] = useState({});
  const [statsLoading, setStatsLoading] = useState({});
  const [expanded, setExpanded] = useState(null);
  useEffect(() => {
    fetchCampaigns().then((list) => {
      setSaved(list);
      setSavedLoading(false);
    });
  }, []);
  const effectiveSource = source2 === "__custom__" ? customSource : source2;
  const effectiveMedium = medium === "__custom__" ? customMedium : medium;
  const generatedUrl = (() => {
    if (!baseUrl) return "";
    try {
      const u = new URL(baseUrl);
      if (effectiveSource) u.searchParams.set("utm_source", effectiveSource);
      if (effectiveMedium) u.searchParams.set("utm_medium", effectiveMedium);
      if (campaign) u.searchParams.set("utm_campaign", campaign);
      if (content) u.searchParams.set("utm_content", content);
      if (term) u.searchParams.set("utm_term", term);
      return u.toString();
    } catch {
      return "";
    }
  })();
  function copyGenerated() {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).then(() => toast$1.success("URL copied!"));
  }
  async function saveCampaign() {
    if (!generatedUrl) {
      toast$1.error("Enter a base URL first");
      return;
    }
    if (!campaign) {
      toast$1.error("Enter a campaign name to save");
      return;
    }
    const name = saveName || campaign;
    const id = Date.now().toString();
    const token = await getToken();
    const res = await fetch("/api/utm-campaigns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...token ? {
          Authorization: `Bearer ${token}`
        } : {}
      },
      credentials: "include",
      body: JSON.stringify({
        id,
        name,
        base_url: baseUrl,
        utm_source: effectiveSource,
        utm_medium: effectiveMedium,
        utm_campaign: campaign,
        utm_content: content || null,
        utm_term: term || null
      })
    });
    if (!res.ok) {
      toast$1.error("Failed to save campaign");
      return;
    }
    const updated = await fetchCampaigns();
    setSaved(updated);
    setSaveName("");
    toast$1.success(`Campaign "${name}" saved!`);
  }
  async function removeSaved(id) {
    const token = await getToken();
    const res = await fetch("/api/utm-campaigns", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...token ? {
          Authorization: `Bearer ${token}`
        } : {}
      },
      credentials: "include",
      body: JSON.stringify({
        id
      })
    });
    if (!res.ok) {
      toast$1.error("Failed to delete campaign");
      return;
    }
    setSaved((prev) => prev.filter((s) => s.id !== id));
    if (expanded === id) setExpanded(null);
  }
  function copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => toast$1.success("Copied!"));
  }
  async function toggleStats(item) {
    if (expanded === item.id) {
      setExpanded(null);
      return;
    }
    setExpanded(item.id);
    if (stats[item.id] !== void 0) return;
    let utmCampaign = "";
    try {
      utmCampaign = new URL(item.url).searchParams.get("utm_campaign") ?? "";
    } catch {
      utmCampaign = "";
    }
    if (!utmCampaign) {
      setStats((prev) => ({
        ...prev,
        [item.id]: {
          visitors: 0,
          payments: 0,
          conversion: "0%"
        }
      }));
      return;
    }
    setStatsLoading((prev) => ({
      ...prev,
      [item.id]: true
    }));
    const safe = utmCampaign.replace(/'/g, "\\'");
    try {
      const [visitorsRes, scrollRes, clicksRes] = await Promise.all([phQuery({
        kind: "HogQLQuery",
        query: `SELECT count(DISTINCT person_id) FROM events WHERE properties.utm_campaign = '${safe}' AND event = '$pageview' AND timestamp > now() - INTERVAL 90 DAY`
      }), phQuery({
        kind: "HogQLQuery",
        query: `SELECT avg(toFloatOrDefault(properties.depth, 0.1)) FROM events WHERE properties.utm_campaign = '${safe}' AND event = 'scroll_depth' AND timestamp > now() - INTERVAL 90 DAY`
      }), phQuery({
        kind: "HogQLQuery",
        query: `SELECT count() FROM events WHERE properties.utm_campaign = '${safe}' AND event = '$autocapture' AND properties.$event_type = 'click' AND timestamp > now() - INTERVAL 90 DAY`
      })]);
      const visitors = visitorsRes?.results?.[0]?.[0] ?? 0;
      const avgScroll = scrollRes?.results?.[0]?.[0];
      const clicks = clicksRes?.results?.[0]?.[0] ?? 0;
      setStats((prev) => ({
        ...prev,
        [item.id]: {
          visitors,
          avgScroll: avgScroll != null ? Math.round(Number(avgScroll)) + "%" : "—",
          clicks
        }
      }));
    } catch (e) {
      toast$1.error("Failed to load stats: " + e.message);
      setStats((prev) => ({
        ...prev,
        [item.id]: null
      }));
    } finally {
      setStatsLoading((prev) => ({
        ...prev,
        [item.id]: false
      }));
    }
  }
  if (!isAuthorized) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsx("p", {
        className: "font-['Satoshi'] text-neutral-500",
        children: "Checking access…"
      })
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-6",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-2xl font-semibold text-neutral-900",
          children: "UTM Builder"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
          children: "Build campaign links and track their performance via PostHog"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "grid gap-6 lg:grid-cols-2",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("div", {
            className: "border-b-2 border-neutral-900 px-6 py-4",
            children: /* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
              children: "Build a Link"
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "p-6 space-y-4",
            children: [/* @__PURE__ */ jsx(Field$1, {
              label: "Base URL",
              required: true,
              children: /* @__PURE__ */ jsx("input", {
                type: "url",
                value: baseUrl,
                onChange: (e) => setBaseUrl(e.target.value),
                placeholder: "https://studojo.com/outreach",
                className: inputCls$1
              })
            }), /* @__PURE__ */ jsxs(Field$1, {
              label: "Source (utm_source)",
              required: true,
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex flex-wrap gap-2 mb-2",
                children: [SOURCE_OPTIONS.map((s) => /* @__PURE__ */ jsx(Pill$1, {
                  label: s,
                  active: source2 === s,
                  onClick: () => setSource(s)
                }, s)), /* @__PURE__ */ jsx(Pill$1, {
                  label: "custom",
                  active: source2 === "__custom__",
                  onClick: () => setSource("__custom__")
                })]
              }), source2 === "__custom__" && /* @__PURE__ */ jsx("input", {
                type: "text",
                value: customSource,
                onChange: (e) => setCustomSource(e.target.value),
                placeholder: "e.g. newsletter",
                className: inputCls$1
              })]
            }), /* @__PURE__ */ jsxs(Field$1, {
              label: "Medium (utm_medium)",
              required: true,
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex flex-wrap gap-2 mb-2",
                children: [MEDIUM_OPTIONS.map((m) => /* @__PURE__ */ jsx(Pill$1, {
                  label: m,
                  active: medium === m,
                  onClick: () => setMedium(m)
                }, m)), /* @__PURE__ */ jsx(Pill$1, {
                  label: "custom",
                  active: medium === "__custom__",
                  onClick: () => setMedium("__custom__")
                })]
              }), medium === "__custom__" && /* @__PURE__ */ jsx("input", {
                type: "text",
                value: customMedium,
                onChange: (e) => setCustomMedium(e.target.value),
                placeholder: "e.g. podcast",
                className: inputCls$1
              })]
            }), /* @__PURE__ */ jsxs(Field$1, {
              label: "Campaign name (utm_campaign)",
              required: true,
              children: [/* @__PURE__ */ jsx("input", {
                type: "text",
                value: campaign,
                onChange: (e) => setCampaign(e.target.value.toLowerCase().replace(/\s+/g, "_")),
                placeholder: "e.g. day3_followup",
                className: inputCls$1
              }), /* @__PURE__ */ jsx("p", {
                className: "mt-1 font-['Satoshi'] text-xs text-neutral-400",
                children: "Spaces auto-replaced with underscores"
              })]
            }), /* @__PURE__ */ jsx(Field$1, {
              label: "Content (utm_content) — optional",
              children: /* @__PURE__ */ jsx("input", {
                type: "text",
                value: content,
                onChange: (e) => setContent(e.target.value),
                placeholder: "e.g. cta_button",
                className: inputCls$1
              })
            }), /* @__PURE__ */ jsx(Field$1, {
              label: "Term (utm_term) — optional",
              children: /* @__PURE__ */ jsx("input", {
                type: "text",
                value: term,
                onChange: (e) => setTerm(e.target.value),
                placeholder: "e.g. paid_keyword",
                className: inputCls$1
              })
            }), generatedUrl && /* @__PURE__ */ jsxs("div", {
              className: "rounded-lg border-2 border-violet-200 bg-violet-50 p-4",
              children: [/* @__PURE__ */ jsx("p", {
                className: "mb-1 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-violet-600",
                children: "Generated URL"
              }), /* @__PURE__ */ jsx("p", {
                className: "break-all font-mono text-xs text-violet-900 mb-3",
                children: generatedUrl
              }), /* @__PURE__ */ jsx("button", {
                onClick: copyGenerated,
                className: "rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-1.5 font-['Satoshi'] text-sm font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none",
                children: "Copy URL"
              })]
            }), /* @__PURE__ */ jsx("div", {
              className: "border-t-2 border-neutral-100 pt-4",
              children: /* @__PURE__ */ jsx(Field$1, {
                label: "Save this campaign as",
                children: /* @__PURE__ */ jsxs("div", {
                  className: "flex gap-2",
                  children: [/* @__PURE__ */ jsx("input", {
                    type: "text",
                    value: saveName,
                    onChange: (e) => setSaveName(e.target.value),
                    placeholder: campaign || "Campaign name",
                    className: `${inputCls$1} flex-1`
                  }), /* @__PURE__ */ jsx("button", {
                    onClick: saveCampaign,
                    className: "shrink-0 rounded-lg border-2 border-neutral-900 bg-emerald-400 px-4 py-2 font-['Satoshi'] text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none",
                    children: "Save & Track"
                  })]
                })
              })
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "border-b-2 border-neutral-900 px-6 py-4",
            children: [/* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
              children: "Saved Campaigns"
            }), /* @__PURE__ */ jsx("p", {
              className: "mt-0.5 font-['Satoshi'] text-xs text-neutral-400",
              children: "Expand to see live PostHog stats (last 90 days)"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "divide-y divide-neutral-100",
            children: [savedLoading && /* @__PURE__ */ jsx("p", {
              className: "px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400",
              children: "Loading campaigns…"
            }), !savedLoading && saved.length === 0 && /* @__PURE__ */ jsx("p", {
              className: "px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400",
              children: "No campaigns saved yet. Build and save one on the left."
            }), saved.map((item) => {
              const isExpanded = expanded === item.id;
              const s = stats[item.id];
              const loading = statsLoading[item.id];
              return /* @__PURE__ */ jsxs("div", {
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-3 px-6 py-4",
                  children: [/* @__PURE__ */ jsxs("div", {
                    className: "flex-1 min-w-0",
                    children: [/* @__PURE__ */ jsx("p", {
                      className: "font-['Satoshi'] text-sm font-semibold text-neutral-900 truncate",
                      children: item.name
                    }), /* @__PURE__ */ jsx("p", {
                      className: "font-['Satoshi'] text-xs text-neutral-400",
                      children: new Date(item.created).toLocaleDateString()
                    })]
                  }), /* @__PURE__ */ jsx("button", {
                    onClick: () => copyUrl(item.url),
                    className: "shrink-0 rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-600",
                    children: "Copy"
                  }), /* @__PURE__ */ jsx("button", {
                    onClick: () => toggleStats(item),
                    className: `shrink-0 rounded-lg border-2 border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${isExpanded ? "bg-violet-500 text-white" : "bg-white text-neutral-700"}`,
                    children: isExpanded ? "Hide" : "Stats"
                  }), /* @__PURE__ */ jsx("button", {
                    onClick: () => removeSaved(item.id),
                    className: "shrink-0 text-neutral-300 hover:text-red-400 text-sm",
                    title: "Remove",
                    children: "✕"
                  })]
                }), isExpanded && /* @__PURE__ */ jsxs(motion.div, {
                  initial: {
                    opacity: 0,
                    height: 0
                  },
                  animate: {
                    opacity: 1,
                    height: "auto"
                  },
                  exit: {
                    opacity: 0,
                    height: 0
                  },
                  className: "border-t border-neutral-100 bg-neutral-50 px-6 py-4",
                  children: [/* @__PURE__ */ jsx("p", {
                    className: "mb-1 font-['Satoshi'] text-xs text-neutral-400 font-mono break-all",
                    children: item.url
                  }), loading ? /* @__PURE__ */ jsx("p", {
                    className: "font-['Satoshi'] text-xs text-neutral-400 mt-3",
                    children: "Loading stats…"
                  }) : s === null ? /* @__PURE__ */ jsx("p", {
                    className: "font-['Satoshi'] text-xs text-red-400 mt-3",
                    children: "Failed to load stats"
                  }) : s ? /* @__PURE__ */ jsxs("div", {
                    className: "mt-3 grid grid-cols-3 gap-3",
                    children: [/* @__PURE__ */ jsx(MiniStat, {
                      label: "Visitors",
                      value: s.visitors,
                      color: "violet"
                    }), /* @__PURE__ */ jsx(MiniStat, {
                      label: "Avg Scroll",
                      value: s.avgScroll,
                      color: "emerald"
                    }), /* @__PURE__ */ jsx(MiniStat, {
                      label: "Clicks",
                      value: s.clicks,
                      color: "amber"
                    })]
                  }) : null]
                })]
              }, item.id);
            })]
          })]
        })]
      })]
    })]
  });
});
const inputCls$1 = "w-full rounded-lg border-2 border-neutral-200 bg-white px-3 py-2 font-['Satoshi'] text-sm outline-none transition-colors focus:border-violet-500";
function Field$1({
  label,
  required,
  children
}) {
  return /* @__PURE__ */ jsxs("div", {
    children: [/* @__PURE__ */ jsxs("label", {
      className: "mb-1.5 block font-['Satoshi'] text-sm font-semibold text-neutral-700",
      children: [label, required && /* @__PURE__ */ jsx("span", {
        className: "ml-1 text-red-400",
        children: "*"
      })]
    }), children]
  });
}
function Pill$1({
  label,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsx("button", {
    onClick,
    className: `rounded-full border-2 border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-medium shadow-[1px_1px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${active ? "bg-violet-500 text-white" : "bg-white text-neutral-600"}`,
    children: label
  });
}
function MiniStat({
  label,
  value,
  color
}) {
  const text = {
    violet: "text-violet-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700"
  }[color];
  return /* @__PURE__ */ jsxs("div", {
    className: "rounded-lg border border-neutral-200 bg-white p-3 text-center",
    children: [/* @__PURE__ */ jsx("p", {
      className: `font-['Clash_Display'] text-2xl font-bold ${text}`,
      children: typeof value === "number" ? value.toLocaleString() : value
    }), /* @__PURE__ */ jsx("p", {
      className: "font-['Satoshi'] text-xs text-neutral-400",
      children: label
    })]
  });
}
const route34 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: utmBuilder,
  meta: meta$3
}, Symbol.toStringTag, { value: "Module" }));
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS utm_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      utm_source TEXT NOT NULL,
      utm_medium TEXT NOT NULL,
      utm_campaign TEXT NOT NULL,
      utm_content TEXT,
      utm_term TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
async function loader$5({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  await ensureTable();
  const result = await db.execute(sql`SELECT id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at FROM utm_campaigns ORDER BY created_at DESC`);
  return Response.json({
    campaigns: result.rows
  });
}
async function action$2({
  request
}) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return Response.json({
      error: "Method not allowed"
    }, {
      status: 405
    });
  }
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  await ensureTable();
  if (request.method === "DELETE") {
    const {
      id: id2
    } = await request.json();
    if (!id2) return Response.json({
      error: "id required"
    }, {
      status: 400
    });
    await db.execute(sql`DELETE FROM utm_campaigns WHERE id = ${id2}`);
    return Response.json({
      success: true
    });
  }
  const {
    id,
    name,
    base_url,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term
  } = await request.json();
  if (!id || !name || !base_url || !utm_source || !utm_medium || !utm_campaign) {
    return Response.json({
      error: "id, name, base_url, utm_source, utm_medium, utm_campaign required"
    }, {
      status: 400
    });
  }
  await db.execute(sql`
    INSERT INTO utm_campaigns (id, name, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at)
    VALUES (${id}, ${name}, ${base_url}, ${utm_source}, ${utm_medium}, ${utm_campaign}, ${utm_content ?? null}, ${utm_term ?? null}, NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  return Response.json({
    success: true
  });
}
const route35 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
function meta$2(_) {
  return [{
    title: "Coupons — Studojo Admin"
  }];
}
function randomCode(prefix = "") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix ? prefix.toUpperCase() + "" : "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function couponStatus(c) {
  if (!c.is_active) return "inactive";
  if (c.valid_until && new Date(c.valid_until) < /* @__PURE__ */ new Date()) return "expired";
  if (c.max_uses != null && c.uses >= c.max_uses) return "exhausted";
  return "active";
}
function expiresInHours(h) {
  return new Date(Date.now() + h * 60 * 60 * 1e3).toISOString();
}
async function authedFetch(url, opts = {}) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...token ? {
        Authorization: `Bearer ${token}`
      } : {},
      ...opts.headers ?? {}
    },
    credentials: "include"
  });
}
const coupons = UNSAFE_withComponentProps(function Coupons() {
  const {
    isAuthorized
  } = useAdminGuard();
  const [coupons2, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState(() => randomCode());
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [expiryPreset, setExpiryPreset] = useState("24h");
  const [customExpiry, setCustomExpiry] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [distributorName, setDistributorName] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    loadCoupons();
  }, []);
  async function loadCoupons() {
    setLoading(true);
    const res = await authedFetch("/api/coupons");
    if (res.ok) {
      const data = await res.json();
      setCoupons(data.coupons ?? []);
    }
    setLoading(false);
  }
  async function createCoupon() {
    if (!code.trim()) {
      toast$1.error("Enter a coupon code");
      return;
    }
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      toast$1.error("Enter a valid discount value");
      return;
    }
    if (discountType === "percent" && val > 100) {
      toast$1.error("Percentage can't exceed 100");
      return;
    }
    let expires_at = null;
    if (expiryPreset === "24h") expires_at = expiresInHours(24);
    else if (expiryPreset === "7d") expires_at = expiresInHours(24 * 7);
    else if (expiryPreset === "30d") expires_at = expiresInHours(24 * 30);
    else if (expiryPreset === "custom" && customExpiry) expires_at = new Date(customExpiry).toISOString();
    setCreating(true);
    const res = await authedFetch("/api/coupons", {
      method: "POST",
      body: JSON.stringify({
        code: code.trim(),
        discount_type: discountType,
        discount_value: val,
        max_uses: maxUses ? parseInt(maxUses) : null,
        valid_until: expires_at,
        distributor_name: distributorName.trim() || null
      })
    });
    setCreating(false);
    if (!res.ok) {
      const err = await res.json();
      toast$1.error(err.error ?? "Failed to create coupon");
      return;
    }
    toast$1.success(`Coupon ${code.toUpperCase()} created`);
    setCode(randomCode());
    setDistributorName("");
    setMaxUses("");
    await loadCoupons();
  }
  async function deleteCoupon(id, code2) {
    const res = await authedFetch("/api/coupons", {
      method: "DELETE",
      body: JSON.stringify({
        id
      })
    });
    if (!res.ok) {
      toast$1.error("Failed to delete coupon");
      return;
    }
    toast$1.success(`Coupon ${code2} deleted`);
    setCoupons((prev) => prev.filter((c) => c.id !== id));
  }
  function copyCode(code2) {
    navigator.clipboard.writeText(code2).then(() => toast$1.success(`Copied ${code2}`));
  }
  if (!isAuthorized) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex min-h-screen items-center justify-center bg-neutral-50",
      children: /* @__PURE__ */ jsx("p", {
        className: "font-['Satoshi'] text-neutral-500",
        children: "Checking access…"
      })
    });
  }
  const active = coupons2.filter((c) => couponStatus(c) === "active");
  const inactive = coupons2.filter((c) => couponStatus(c) !== "active");
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-6",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "font-['Clash_Display'] text-2xl font-semibold text-neutral-900",
          children: "Coupon Codes"
        }), /* @__PURE__ */ jsx("p", {
          className: "mt-1 font-['Satoshi'] text-sm text-neutral-500",
          children: "Generate and manage discount codes for checkout"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "grid gap-6 lg:grid-cols-2",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("div", {
            className: "border-b-2 border-neutral-900 px-6 py-4",
            children: /* @__PURE__ */ jsx("h2", {
              className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
              children: "New Coupon"
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "p-6 space-y-5",
            children: [/* @__PURE__ */ jsx(Field, {
              label: "Code",
              required: true,
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex gap-2",
                children: [/* @__PURE__ */ jsx("input", {
                  type: "text",
                  value: code,
                  onChange: (e) => setCode(e.target.value.toUpperCase()),
                  placeholder: "WELCOME10",
                  className: `${inputCls} flex-1 font-mono tracking-widest`
                }), /* @__PURE__ */ jsx("button", {
                  onClick: () => setCode(randomCode()),
                  title: "Generate random code",
                  className: "shrink-0 rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none",
                  children: "↻"
                })]
              })
            }), /* @__PURE__ */ jsx(Field, {
              label: "Discount",
              required: true,
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex gap-2",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "flex rounded-lg border-2 border-neutral-900 overflow-hidden",
                  children: ["percent", "fixed"].map((t) => /* @__PURE__ */ jsx("button", {
                    onClick: () => setDiscountType(t),
                    className: `px-4 py-2 font-['Satoshi'] text-sm font-semibold transition-colors ${discountType === t ? "bg-violet-500 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50"}`,
                    children: t === "percent" ? "%" : "₹ Fixed"
                  }, t))
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  value: discountValue,
                  onChange: (e) => setDiscountValue(e.target.value),
                  min: "1",
                  max: discountType === "percent" ? "100" : void 0,
                  className: `${inputCls} w-28`,
                  placeholder: discountType === "percent" ? "10" : "500"
                }), /* @__PURE__ */ jsx("span", {
                  className: "flex items-center font-['Satoshi'] text-sm text-neutral-400",
                  children: discountType === "percent" ? "%" : "₹"
                })]
              })
            }), /* @__PURE__ */ jsxs(Field, {
              label: "Expires",
              children: [/* @__PURE__ */ jsx("div", {
                className: "flex flex-wrap gap-2 mb-2",
                children: ["24h", "7d", "30d", "never", "custom"].map((p) => /* @__PURE__ */ jsx(Pill, {
                  label: p === "24h" ? "24 hours" : p === "7d" ? "7 days" : p === "30d" ? "30 days" : p === "never" ? "Never" : "Custom",
                  active: expiryPreset === p,
                  onClick: () => setExpiryPreset(p)
                }, p))
              }), expiryPreset === "custom" && /* @__PURE__ */ jsx("input", {
                type: "datetime-local",
                value: customExpiry,
                onChange: (e) => setCustomExpiry(e.target.value),
                className: inputCls
              })]
            }), /* @__PURE__ */ jsx(Field, {
              label: "Max uses (leave blank for unlimited)",
              children: /* @__PURE__ */ jsx("input", {
                type: "number",
                value: maxUses,
                onChange: (e) => setMaxUses(e.target.value),
                min: "1",
                placeholder: "Unlimited",
                className: inputCls
              })
            }), /* @__PURE__ */ jsx(Field, {
              label: "Source / distributor (internal)",
              children: /* @__PURE__ */ jsx("input", {
                type: "text",
                value: distributorName,
                onChange: (e) => setDistributorName(e.target.value),
                placeholder: "e.g. leads-ready email, George, CU Chalants",
                className: inputCls
              })
            }), /* @__PURE__ */ jsx("button", {
              onClick: createCoupon,
              disabled: creating,
              className: "w-full rounded-lg border-2 border-neutral-900 bg-violet-500 py-3 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:opacity-50",
              children: creating ? "Creating…" : "Create Coupon"
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("div", {
            className: "border-b-2 border-neutral-900 px-6 py-4 flex items-center justify-between",
            children: /* @__PURE__ */ jsxs("h2", {
              className: "font-['Clash_Display'] text-base font-semibold text-neutral-900",
              children: ["Active Coupons", active.length > 0 && /* @__PURE__ */ jsx("span", {
                className: "ml-2 rounded-full bg-emerald-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-emerald-700",
                children: active.length
              })]
            })
          }), /* @__PURE__ */ jsxs("div", {
            className: "divide-y divide-neutral-100 max-h-[420px] overflow-y-auto",
            children: [loading && /* @__PURE__ */ jsx("p", {
              className: "px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400",
              children: "Loading…"
            }), !loading && active.length === 0 && /* @__PURE__ */ jsx("p", {
              className: "px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400",
              children: "No active coupons. Create one on the left."
            }), active.map((c) => /* @__PURE__ */ jsx(CouponRow, {
              coupon: c,
              onCopy: copyCode,
              onDelete: deleteCoupon
            }, c.id))]
          }), inactive.length > 0 && /* @__PURE__ */ jsxs(Fragment, {
            children: [/* @__PURE__ */ jsx("div", {
              className: "border-t-2 border-neutral-900 px-6 py-3 bg-neutral-50",
              children: /* @__PURE__ */ jsx("p", {
                className: "font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-400",
                children: "Expired / Used up"
              })
            }), /* @__PURE__ */ jsx("div", {
              className: "divide-y divide-neutral-100 max-h-48 overflow-y-auto opacity-60",
              children: inactive.map((c) => /* @__PURE__ */ jsx(CouponRow, {
                coupon: c,
                onCopy: copyCode,
                onDelete: deleteCoupon
              }, c.id))
            })]
          })]
        })]
      })]
    })]
  });
});
function CouponRow({
  coupon: c,
  onCopy,
  onDelete
}) {
  const status = couponStatus(c);
  const statusBadge = {
    active: "bg-emerald-100 text-emerald-700",
    expired: "bg-neutral-100 text-neutral-500",
    exhausted: "bg-amber-100 text-amber-700",
    inactive: "bg-red-100 text-red-600"
  }[status];
  const discountLabel = c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`;
  const expiryLabel = c.valid_until ? new Date(c.valid_until) < /* @__PURE__ */ new Date() ? `Expired ${new Date(c.valid_until).toLocaleDateString()}` : `Expires ${new Date(c.valid_until).toLocaleDateString()}` : "Never expires";
  const usageLabel = c.max_uses != null ? `${c.uses} / ${c.max_uses}` : `${c.uses}`;
  const createdLabel = c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }) : null;
  return /* @__PURE__ */ jsxs("div", {
    className: "flex items-center gap-3 px-6 py-4",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "flex-1 min-w-0",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex items-center gap-2 flex-wrap",
        children: [/* @__PURE__ */ jsx("span", {
          className: "font-mono text-sm font-bold text-neutral-900 tracking-wider",
          children: c.code
        }), /* @__PURE__ */ jsx("span", {
          className: `rounded-full px-2 py-0.5 font-['Satoshi'] text-xs font-semibold ${statusBadge}`,
          children: status
        }), /* @__PURE__ */ jsx("span", {
          className: "rounded-full bg-violet-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-violet-700",
          children: discountLabel
        }), /* @__PURE__ */ jsxs("span", {
          className: "rounded-full bg-neutral-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-neutral-600",
          children: [usageLabel, " uses"]
        })]
      }), /* @__PURE__ */ jsxs("p", {
        className: "mt-0.5 font-['Satoshi'] text-xs text-neutral-400",
        children: [expiryLabel, c.distributor_name && ` · ${c.distributor_name}`, createdLabel && ` · Created ${createdLabel}`]
      })]
    }), /* @__PURE__ */ jsx("button", {
      onClick: () => onCopy(c.code),
      className: "shrink-0 rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-600",
      children: "Copy"
    }), /* @__PURE__ */ jsx("button", {
      onClick: () => onDelete(c.id, c.code),
      className: "shrink-0 text-neutral-300 hover:text-red-400 text-sm",
      title: "Delete",
      children: "✕"
    })]
  });
}
const inputCls = "w-full rounded-lg border-2 border-neutral-200 bg-white px-3 py-2 font-['Satoshi'] text-sm outline-none transition-colors focus:border-violet-500";
function Field({
  label,
  required,
  children
}) {
  return /* @__PURE__ */ jsxs("div", {
    children: [/* @__PURE__ */ jsxs("label", {
      className: "mb-1.5 block font-['Satoshi'] text-sm font-semibold text-neutral-700",
      children: [label, required && /* @__PURE__ */ jsx("span", {
        className: "ml-1 text-red-400",
        children: "*"
      })]
    }), children]
  });
}
function Pill({
  label,
  active,
  onClick
}) {
  return /* @__PURE__ */ jsx("button", {
    onClick,
    className: `rounded-full border-2 border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-medium shadow-[1px_1px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${active ? "bg-violet-500 text-white" : "bg-white text-neutral-600"}`,
    children: label
  });
}
const route36 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: coupons,
  meta: meta$2
}, Symbol.toStringTag, { value: "Module" }));
async function loader$4({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const result = await db.execute(sql`
    SELECT id, code, discount_type, discount_value, max_uses, uses,
           valid_from, valid_until, distributor_name, is_active, created_at
    FROM coupons
    ORDER BY created_at DESC
  `);
  return Response.json({
    coupons: result.rows
  });
}
async function action$1({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  if (request.method === "DELETE") {
    const {
      id
    } = await request.json();
    await db.execute(sql`DELETE FROM coupons WHERE id = ${id}`);
    return Response.json({
      ok: true
    });
  }
  if (request.method === "POST") {
    const body = await request.json();
    const {
      code,
      discount_type,
      discount_value,
      max_uses,
      valid_until,
      distributor_name
    } = body;
    if (!code || !discount_type || discount_value == null) {
      return Response.json({
        error: "Missing required fields"
      }, {
        status: 400
      });
    }
    try {
      const result = await db.execute(sql`
        INSERT INTO coupons (code, discount_type, discount_value, max_uses, valid_from, valid_until, distributor_name, is_active, created_at)
        VALUES (
          ${code.toUpperCase().trim()},
          ${discount_type},
          ${discount_value},
          ${max_uses ?? null},
          NOW(),
          ${valid_until ?? null},
          ${distributor_name ?? null},
          true,
          NOW()
        )
        RETURNING id, code, discount_type, discount_value, max_uses, uses,
                  valid_from, valid_until, distributor_name, is_active, created_at
      `);
      return Response.json({
        coupon: result.rows[0]
      });
    } catch (err) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return Response.json({
          error: "Coupon code already exists"
        }, {
          status: 409
        });
      }
      throw err;
    }
  }
  return Response.json({
    error: "Method not allowed"
  }, {
    status: 405
  });
}
const route37 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID ?? "150589";
const BASE = `https://eu.posthog.com/api/projects/${PROJECT_ID}`;
function phHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
  };
}
async function loader$3({
  request
}) {
  if (!API_KEY) {
    return Response.json({
      error: "PostHog API key not configured"
    }, {
      status: 503
    });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  try {
    if (type === "sessions") {
      const limit = url.searchParams.get("limit") ?? "20";
      const offset = url.searchParams.get("offset") ?? "0";
      const minDuration = url.searchParams.get("min_duration");
      let qs = `?limit=${limit}&offset=${offset}`;
      if (minDuration) qs += `&duration_filter_type=duration_gt&duration=${minDuration}`;
      const res = await fetch(`${BASE}/session_recordings/${qs}`, {
        headers: phHeaders()
      });
      const data = await res.json();
      return Response.json(data, {
        status: res.status
      });
    }
    if (type === "persons") {
      const search = url.searchParams.get("search") ?? "";
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      let qs = `?limit=${limit}&offset=${offset}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res = await fetch(`${BASE}/persons/${qs}`, {
        headers: phHeaders()
      });
      const data = await res.json();
      return Response.json(data, {
        status: res.status
      });
    }
    if (type === "cohorts") {
      const res = await fetch(`${BASE}/cohorts/?limit=100`, {
        headers: phHeaders()
      });
      const data = await res.json();
      return Response.json(data, {
        status: res.status
      });
    }
    if (type === "cohort_persons") {
      const cohortId = url.searchParams.get("cohort_id");
      const limit = url.searchParams.get("limit") ?? "10";
      if (!cohortId) return Response.json({
        error: "cohort_id required"
      }, {
        status: 400
      });
      const res = await fetch(`${BASE}/persons/?cohort=${cohortId}&limit=${limit}`, {
        headers: phHeaders()
      });
      const data = await res.json();
      return Response.json(data, {
        status: res.status
      });
    }
    if (type === "persons_count") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      let qs = "?limit=1";
      if (start) qs += `&created_after=${encodeURIComponent(start + "T00:00:00Z")}`;
      if (end) qs += `&created_before=${encodeURIComponent(end + "T23:59:59Z")}`;
      const res = await fetch(`${BASE}/persons/${qs}`, {
        headers: phHeaders()
      });
      const data = await res.json();
      return Response.json({
        count: data.count ?? 0
      }, {
        status: res.status
      });
    }
    if (type === "person_events") {
      const personId = url.searchParams.get("person_id");
      if (!personId) return Response.json({
        error: "person_id required"
      }, {
        status: 400
      });
      const res = await fetch(`${BASE}/query/`, {
        method: "POST",
        headers: phHeaders(),
        body: JSON.stringify({
          query: {
            kind: "HogQLQuery",
            query: `SELECT event, timestamp,
              properties.$pathname,
              properties.$current_url,
              properties.file_type,
              properties.tier,
              properties.amount_cents,
              properties.campaign_id,
              properties.leads_found,
              properties.enriched_count,
              properties.email_address,
              properties.error_type,
              properties.coupon_code,
              properties.question_number,
              properties.answer_type,
              properties.provider,
              properties.covered_by_credits,
              properties.reason,
              properties.company,
              properties.$device_type,
              properties.$geoip_country_name
            FROM events WHERE person_id = '${personId}' ORDER BY timestamp DESC LIMIT 80`
          }
        })
      });
      const data = await res.json();
      return Response.json(data, {
        status: res.status
      });
    }
    return Response.json({
      error: "Unknown type"
    }, {
      status: 400
    });
  } catch (err) {
    return Response.json({
      error: err.message
    }, {
      status: 500
    });
  }
}
async function action({
  request
}) {
  if (!API_KEY) {
    return Response.json({
      error: "PostHog API key not configured"
    }, {
      status: 503
    });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  if (type !== "query") {
    return Response.json({
      error: "POST only supports type=query"
    }, {
      status: 400
    });
  }
  try {
    const body = await request.json();
    const res = await fetch(`${BASE}/query/`, {
      method: "POST",
      headers: phHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return Response.json(data, {
      status: res.status
    });
  } catch (err) {
    return Response.json({
      error: err.message
    }, {
      status: 500
    });
  }
}
const route38 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
async function loader$2({
  request
}) {
  const admin = await requireAdmin$1(request);
  if (!admin) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) {
    return Response.json({
      error: "start and end required"
    }, {
      status: 400
    });
  }
  try {
    const countResult = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM "user"
      WHERE DATE(created_at + INTERVAL '5.5 hours') >= ${start}::date
        AND DATE(created_at + INTERVAL '5.5 hours') <= ${end}::date
    `);
    const dailyResult = await db.execute(sql`
      SELECT DATE(created_at + INTERVAL '5.5 hours') AS day, COUNT(*)::int AS signups
      FROM "user"
      WHERE DATE(created_at + INTERVAL '5.5 hours') >= ${start}::date
        AND DATE(created_at + INTERVAL '5.5 hours') <= ${end}::date
      GROUP BY day
      ORDER BY day ASC
    `);
    const count = countResult.rows[0]?.count ?? 0;
    const daily = dailyResult.rows.map((r) => ({
      day: String(r.day).split("T")[0],
      signups: r.signups ?? 0
    }));
    return Response.json({
      count,
      daily
    });
  } catch (err) {
    return Response.json({
      error: err.message
    }, {
      status: 500
    });
  }
}
const route39 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const JOB_OUTREACH_URL = process.env.JOB_OUTREACH_URL ?? (process.env.JOB_OUTREACH_SVC_SERVICE_HOST ? `http://${process.env.JOB_OUTREACH_SVC_SERVICE_HOST}:${process.env.JOB_OUTREACH_SVC_SERVICE_PORT ?? 8e3}` : "http://job-outreach-svc:8000");
async function loader$1({
  request
}) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return Response.json({
    error: "Unauthorized"
  }, {
    status: 401
  });
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const headers2 = {
    Authorization: authHeader,
    "Content-Type": "application/json"
  };
  const noCache = {
    "Cache-Control": "no-store"
  };
  try {
    if (type === "overview") {
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/overview`, {
        headers: headers2
      });
      return Response.json(await res.json(), {
        status: res.status,
        headers: noCache
      });
    }
    if (type === "users") {
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      const search = url.searchParams.get("search");
      const statusFilter = url.searchParams.get("status_filter");
      let qs = `?limit=${limit}&offset=${offset}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) qs += `&status_filter=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/users${qs}`, {
        headers: headers2
      });
      return Response.json(await res.json(), {
        status: res.status,
        headers: noCache
      });
    }
    if (type === "user_detail") {
      const userId = url.searchParams.get("user_id");
      if (!userId) return Response.json({
        error: "user_id required"
      }, {
        status: 400
      });
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/users/${userId}/detail`, {
        headers: headers2
      });
      return Response.json(await res.json(), {
        status: res.status,
        headers: noCache
      });
    }
    if (type === "campaign_emails") {
      const campaignId = url.searchParams.get("campaign_id");
      if (!campaignId) return Response.json({
        error: "campaign_id required"
      }, {
        status: 400
      });
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/campaign/${campaignId}/emails`, {
        headers: headers2
      });
      return Response.json(await res.json(), {
        status: res.status,
        headers: noCache
      });
    }
    if (type === "payments") {
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      const search = url.searchParams.get("search");
      const statusFilter = url.searchParams.get("status_filter") ?? "paid";
      let qs = `?limit=${limit}&offset=${offset}&status_filter=${encodeURIComponent(statusFilter)}`;
      if (search) qs += `&search=${encodeURIComponent(search)}`;
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/payments${qs}`, {
        headers: headers2
      });
      return Response.json(await res.json(), {
        status: res.status,
        headers: noCache
      });
    }
    if (type === "paid_funnel") {
      const res = await fetch(`${JOB_OUTREACH_URL}/api/v1/admin/outreach/paid-funnel`, {
        headers: headers2
      });
      return Response.json(await res.json(), {
        status: res.status,
        headers: noCache
      });
    }
    return Response.json({
      error: "Unknown type"
    }, {
      status: 400
    });
  } catch (err) {
    return Response.json({
      error: err.message
    }, {
      status: 500
    });
  }
}
const route40 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
function meta$1(_) {
  return [{
    title: "Career Coach — Studojo Admin"
  }];
}
const CC_API = "https://studojo.com/api/v1/cc";
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit"
  });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN");
}
function StatCard({
  num,
  label,
  sub,
  color
}) {
  const colors = {
    purple: {
      bg: "bg-violet-50",
      border: "border-violet-200",
      num: "text-violet-600"
    },
    blue: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      num: "text-blue-600"
    },
    green: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      num: "text-emerald-600"
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      num: "text-amber-600"
    },
    red: {
      bg: "bg-red-50",
      border: "border-red-200",
      num: "text-red-500"
    },
    teal: {
      bg: "bg-teal-50",
      border: "border-teal-200",
      num: "text-teal-600"
    }
  };
  const c = colors[color];
  return /* @__PURE__ */ jsxs("div", {
    className: `${c.bg} rounded-2xl border-2 ${c.border} p-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]`,
    children: [/* @__PURE__ */ jsx("div", {
      className: `font-['Clash_Display'] text-4xl font-black ${c.num}`,
      children: num
    }), /* @__PURE__ */ jsx("div", {
      className: "mt-1 text-xs font-semibold uppercase tracking-widest text-neutral-500",
      children: label
    }), sub && /* @__PURE__ */ jsx("div", {
      className: "mt-0.5 text-xs text-neutral-400",
      children: sub
    })]
  });
}
const FUNNEL_COLORS = ["#8B5CF6", "#A855F7", "#EC4899", "#EF4444", "#F59E0B", "#10B981"];
const STATE_PILL = {
  GREETING: "bg-blue-100 text-blue-700",
  PROFILING: "bg-amber-100 text-amber-800",
  DNA_REVIEW: "bg-violet-100 text-violet-700",
  CAREER_ANALYSIS: "bg-violet-100 text-violet-700",
  ROADMAP: "bg-emerald-100 text-emerald-800",
  ONGOING_SUPPORT: "bg-emerald-100 text-emerald-800"
};
function AnonSessionsPanel({
  ccHeaders
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  async function load() {
    if (data) {
      setOpen(true);
      return;
    }
    setLoading(true);
    setOpen(true);
    try {
      const r = await fetch(`${CC_API}/admin/anonymous-sessions`, {
        headers: ccHeaders()
      });
      const d = r.ok ? await r.json() : null;
      setData(Array.isArray(d?.anonymous_students) ? d.anonymous_students : []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "mt-6 rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-4",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "flex items-center justify-between",
      children: [/* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsx("div", {
          className: "font-['Satoshi'] text-sm font-bold text-neutral-600",
          children: "Anonymous / Pre-login Sessions"
        }), /* @__PURE__ */ jsx("div", {
          className: "text-xs text-neutral-400",
          children: "Students who chatted before creating an account — not linked to any email"
        })]
      }), /* @__PURE__ */ jsx("button", {
        onClick: open ? () => setOpen(false) : load,
        className: "rounded-full border-2 border-neutral-400 bg-white px-4 py-1.5 text-xs font-bold text-neutral-600 shadow-[2px_2px_0px_0px_rgba(25,26,35,0.3)] hover:border-neutral-900 hover:text-neutral-900",
        children: open ? "Hide" : "View sessions →"
      })]
    }), open && /* @__PURE__ */ jsx("div", {
      className: "mt-4",
      children: loading ? /* @__PURE__ */ jsx("p", {
        className: "text-xs text-neutral-400",
        children: "Loading…"
      }) : !data || data.length === 0 ? /* @__PURE__ */ jsx("p", {
        className: "text-xs text-neutral-400",
        children: "No anonymous sessions found."
      }) : /* @__PURE__ */ jsxs("div", {
        className: "space-y-3",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "text-[11px] font-semibold text-neutral-500",
          children: [data.length, " anonymous visitor", data.length === 1 ? "" : "s", " · ", data.reduce((n, s) => n + s.message_count, 0), " messages total"]
        }), data.map((anon, ai) => /* @__PURE__ */ jsxs("div", {
          className: "rounded-xl border border-neutral-200 bg-white",
          children: [/* @__PURE__ */ jsxs("button", {
            className: "flex w-full items-center justify-between px-4 py-3 text-left",
            onClick: () => setExpanded(expanded === anon.student_id ? null : anon.student_id),
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsxs("span", {
                className: "font-['Satoshi'] text-xs font-bold text-neutral-700",
                children: ["Visitor ", ai + 1]
              }), /* @__PURE__ */ jsxs("span", {
                className: "ml-2 text-[10px] text-neutral-400",
                children: [anon.session_count, " session", anon.session_count === 1 ? "" : "s", " · ", anon.message_count, " msgs"]
              }), anon.first_seen ? /* @__PURE__ */ jsxs("span", {
                className: "ml-2 text-[10px] text-neutral-400",
                children: ["· first seen ", new Date(anon.first_seen).toLocaleDateString("en-IN")]
              }) : null]
            }), /* @__PURE__ */ jsx("span", {
              className: "text-[10px] text-neutral-400",
              children: expanded === anon.student_id ? "▲ hide" : "▼ show chats"
            })]
          }), expanded === anon.student_id && /* @__PURE__ */ jsx("div", {
            className: "space-y-3 border-t border-neutral-100 p-3",
            children: anon.sessions.map((sess, si) => /* @__PURE__ */ jsxs("div", {
              className: "rounded-lg border border-neutral-100 bg-neutral-50",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex items-center justify-between border-b border-neutral-100 px-3 py-2",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [/* @__PURE__ */ jsxs("span", {
                    className: "rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600",
                    children: ["Session ", si + 1]
                  }), /* @__PURE__ */ jsx("span", {
                    className: "truncate text-xs font-semibold text-neutral-700",
                    children: sess.title
                  })]
                }), /* @__PURE__ */ jsxs("span", {
                  className: "shrink-0 text-[10px] text-neutral-400",
                  children: [sess.message_count, " msgs", sess.created_at ? ` · ${new Date(sess.created_at).toLocaleDateString("en-IN")}` : ""]
                })]
              }), /* @__PURE__ */ jsx("div", {
                className: "space-y-2 p-3",
                children: sess.messages.map((m, mi) => /* @__PURE__ */ jsx("div", {
                  className: `flex ${m.role === "user" ? "justify-end" : "justify-start"}`,
                  children: /* @__PURE__ */ jsx("div", {
                    className: `max-w-[80%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed ${m.role === "user" ? "bg-neutral-700 text-white" : "border border-neutral-200 bg-white text-neutral-800"}`,
                    children: renderAdminMsg(m.content)
                  })
                }, mi))
              })]
            }, sess.conversation_id))
          })]
        }, anon.student_id))]
      })
    })]
  });
}
const ADMIN_TOOL_LINKS = [{
  re: /(?:https?:\/\/)?(?:www\.)?studojo\.com\/outreach(?:\/onboarding\/upload)?[^\s)]*/gi,
  label: "Outreach Dojo →",
  href: "https://studojo.com/outreach"
}, {
  re: /(?:https?:\/\/)?(?:www\.)?studojo\.com\/resume-maker[^\s)]*/gi,
  label: "Resume Maker →",
  href: "https://studojo.com/resume-maker"
}, {
  re: /(?:https?:\/\/)?(?:www\.)?studojo\.com\/dojos\/internships[^\s)]*/gi,
  label: "Internship Dojo →",
  href: "https://studojo.com/dojos/internships"
}, {
  re: /(?:https?:\/\/)?(?:www\.)?studojo\.com\/reports[^\s)]*/gi,
  label: "Reports →",
  href: "https://studojo.com/reports"
}, {
  re: /(?:https?:\/\/)?(?:www\.)?studojo\.com\/dojos\/ai-risk[^\s)]*/gi,
  label: "AI Risk Dojo →",
  href: "https://studojo.com/dojos/ai-risk"
}];
function renderAdminMsg(content) {
  if (!content) return null;
  let text = content;
  const buttons = [];
  for (const tool of ADMIN_TOOL_LINKS) {
    tool.re.lastIndex = 0;
    if (tool.re.test(text)) {
      tool.re.lastIndex = 0;
      text = text.replace(tool.re, "").replace(/\s*:\s*$/, "").replace(/\s{2,}/g, " ").trim();
      buttons.push({
        label: tool.label,
        href: tool.href
      });
    }
  }
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [text, buttons.map((b, i) => /* @__PURE__ */ jsx("a", {
      href: b.href,
      target: "_blank",
      rel: "noopener noreferrer",
      className: "mt-1.5 flex w-fit items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-100 no-underline",
      children: b.label
    }, i))]
  });
}
const careerCoach = UNSAFE_withComponentProps(function CareerCoachAdmin(_) {
  const {
    isAuthorized
  } = useAdminGuard();
  const [keyError, setKeyError] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [activeGranularity, setActiveGranularity] = useState("hour");
  const [chartTz, setChartTz] = useState("IST");
  const [activeBucket, setActiveBucket] = useState(null);
  const [bucketStudents, setBucketStudents] = useState(null);
  const [loadingBucket, setLoadingBucket] = useState(false);
  const [overview, setOverview] = useState(null);
  const [locations, setLocations] = useState(null);
  const [dropouts, setDropouts] = useState(null);
  const [loadingDropouts, setLoadingDropouts] = useState(false);
  const [openDropper, setOpenDropper] = useState(null);
  const [funnel2, setFunnel] = useState(null);
  const [dropoffs, setDropoffs] = useState(null);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState(null);
  const [paths, setPaths] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentActivity, setStudentActivity] = useState(null);
  const [transcripts, setTranscripts] = useState(null);
  const [showTranscripts, setShowTranscripts] = useState(false);
  const [loadingTranscripts, setLoadingTranscripts] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adminNotes, setAdminNotes] = useState({});
  const [resumeView, setResumeView] = useState(null);
  const [resumeViewFor, setResumeViewFor] = useState(null);
  const [loadingResume, setLoadingResume] = useState(false);
  const [pathDrilldown, setPathDrilldown] = useState(null);
  async function loadPathDrilldown(label, type) {
    setPathDrilldown({
      label,
      type,
      students: [],
      loading: true
    });
    const param = type === "role" ? `role=${encodeURIComponent(label)}` : `industry=${encodeURIComponent(label)}`;
    try {
      const r = await fetch(`${CC_API}/admin/career-paths/students?${param}`, {
        headers: {
          "Content-Type": "application/json"
        }
      });
      const d = r.ok ? await r.json() : [];
      setPathDrilldown({
        label,
        type,
        students: Array.isArray(d) ? d : [],
        loading: false
      });
    } catch {
      setPathDrilldown({
        label,
        type,
        students: [],
        loading: false
      });
    }
  }
  useEffect(() => {
    loadAll();
  }, []);
  useEffect(() => {
    if (isAuthorized) {
      setAuthenticated(true);
    }
  }, [isAuthorized]);
  useEffect(() => {
    if (tab !== "dropouts" || dropouts || loadingDropouts) return;
    setLoadingDropouts(true);
    fetch(`${CC_API}/admin/dropouts`, {
      headers: {
        "Content-Type": "application/json"
      }
    }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setDropouts(d);
    }).catch(() => {
    }).finally(() => setLoadingDropouts(false));
  }, [tab, dropouts, loadingDropouts, authenticated]);
  const ccHeaders = useCallback(() => ({
    "Content-Type": "application/json"
  }), []);
  async function loadAll(_key) {
    setLoading(true);
    try {
      const headers2 = {
        "Content-Type": "application/json"
      };
      const [ov, fu, dr, st, sc, pa, qu] = await Promise.all([fetch(`${CC_API}/admin/overview`, {
        headers: headers2
      }).then((r) => r.json()), fetch(`${CC_API}/admin/funnel`, {
        headers: headers2
      }).then((r) => r.json()), fetch(`${CC_API}/admin/dropoffs`, {
        headers: headers2
      }).then((r) => r.json()), fetch(`${CC_API}/admin/students`, {
        headers: headers2
      }).then((r) => r.json()), fetch(`${CC_API}/admin/scores`, {
        headers: headers2
      }).then((r) => r.json()), fetch(`${CC_API}/admin/career-paths`, {
        headers: headers2
      }).then((r) => r.json()), fetch(`${CC_API}/admin/questions`, {
        headers: headers2
      }).then((r) => r.json())]);
      setOverview(ov);
      fetch(`${CC_API}/admin/locations`, {
        headers: headers2
      }).then((r) => r.ok ? r.json() : null).then((d) => {
        if (d) setLocations(d);
      }).catch(() => {
      });
      setFunnel(fu);
      setDropoffs(dr);
      setStudents(Array.isArray(st) ? st : []);
      setScores(sc);
      setPaths(pa);
      setQuestions(qu);
      toast$1.success("Career Coach data refreshed");
      setKeyError(false);
    } catch (e) {
      toast$1.error("Failed to load career coach data");
      if (!overview) setKeyError(true);
    } finally {
      setLoading(false);
    }
  }
  async function loadBucketStudents(bucketHour, label) {
    setActiveBucket({
      hour: bucketHour,
      label
    });
    setBucketStudents(null);
    setLoadingBucket(true);
    try {
      const url = `${CC_API}/admin/active-students?granularity=${activeGranularity}&bucket=${encodeURIComponent(bucketHour)}`;
      const r = await fetch(url, {
        headers: ccHeaders()
      });
      const d = r.ok ? await r.json() : null;
      setBucketStudents(Array.isArray(d?.students) ? d.students : []);
    } catch {
      setBucketStudents([]);
    } finally {
      setLoadingBucket(false);
    }
  }
  async function loadTranscripts(id) {
    setShowTranscripts(true);
    if (transcripts) return;
    setLoadingTranscripts(true);
    try {
      const r = await fetch(`${CC_API}/admin/student/${id}/transcripts`, {
        headers: ccHeaders()
      });
      const d = r.ok ? await r.json() : null;
      setTranscripts(Array.isArray(d?.conversations) ? d.conversations : []);
    } catch {
      setTranscripts([]);
    } finally {
      setLoadingTranscripts(false);
    }
  }
  async function openStudentPanel(id) {
    setSelectedStudent(id);
    setLoadingDetail(true);
    setStudentDetail(null);
    setStudentActivity(null);
    setTranscripts(null);
    setShowTranscripts(false);
    try {
      const dash = await fetch(`${CC_API}/dashboard/${id}`, {
        headers: ccHeaders()
      }).then((r) => r.json());
      setStudentDetail(dash);
    } catch {
      toast$1.error("Could not load student detail");
    } finally {
      setLoadingDetail(false);
    }
    try {
      const act = await fetch(`${CC_API}/admin/student/${id}/activity`, {
        headers: ccHeaders()
      }).then((r) => r.ok ? r.json() : null);
      setStudentActivity(act ?? {});
    } catch {
      setStudentActivity({});
    }
  }
  function saveNote(id, note) {
    setAdminNotes((prev) => ({
      ...prev,
      [id]: note
    }));
    try {
      localStorage.setItem(`cc_admin_note_${id}`, note);
      toast$1.success("Note saved");
    } catch {
    }
  }
  function loadNote(id) {
    if (adminNotes[id] !== void 0) return adminNotes[id];
    try {
      return localStorage.getItem(`cc_admin_note_${id}`) ?? "";
    } catch {
      return "";
    }
  }
  async function viewResume(studentId, name) {
    setResumeViewFor({
      id: studentId,
      name
    });
    setResumeView(null);
    setLoadingResume(true);
    try {
      const r = await fetch(`${CC_API}/admin/student/${studentId}/resume-view`, {
        headers: ccHeaders()
      });
      setResumeView(r.ok ? await r.json() : null);
    } catch {
      setResumeView(null);
    } finally {
      setLoadingResume(false);
    }
  }
  async function downloadResume(studentId, filename) {
    try {
      const r = await fetch(`${CC_API}/admin/student/${studentId}/resume`, {
        headers: ccHeaders()
      });
      if (!r.ok) {
        toast$1.error("Could not download resume");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `resume-${studentId}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 500);
    } catch {
      toast$1.error("Resume download failed");
    }
  }
  if (!authenticated) {
    return /* @__PURE__ */ jsxs("div", {
      className: "min-h-screen bg-neutral-50",
      children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsx("div", {
        className: "flex min-h-[calc(100vh-80px)] items-center justify-center",
        children: keyError ? /* @__PURE__ */ jsxs("div", {
          className: "w-96 rounded-3xl border-2 border-neutral-900 bg-white p-10 text-center shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("div", {
            className: "mb-2 font-['Clash_Display'] text-xl font-black text-neutral-900",
            children: "Career Coach analytics unavailable"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-500",
            children: "The dashboard could not reach the career coach backend. Please try refreshing."
          })]
        }) : /* @__PURE__ */ jsx("div", {
          className: "text-neutral-500 font-['Satoshi']",
          children: "Loading career coach analytics…"
        })
      })]
    });
  }
  const TABS2 = [{
    id: "overview",
    label: "Overview"
  }, {
    id: "funnel",
    label: "Funnel"
  }, {
    id: "dropouts",
    label: "Dropouts"
  }, {
    id: "students",
    label: "Students"
  }, {
    id: "scores",
    label: "Scores"
  }, {
    id: "paths",
    label: "Career Paths"
  }, {
    id: "questions",
    label: "Q&A"
  }];
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-neutral-50",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("div", {
      className: "mx-auto max-w-6xl px-4 py-8 md:px-8 lg:pr-20",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-6 flex flex-wrap items-start justify-between gap-3",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-['Clash_Display'] text-3xl font-black text-neutral-900",
            children: "Career Coach"
          }), /* @__PURE__ */ jsx("p", {
            className: "mt-1 text-sm text-neutral-500",
            children: overview ? `Updated ${fmtDateTime(overview.generated_at)}` : "Live student analytics from the career coaching agent."
          })]
        }), /* @__PURE__ */ jsx("button", {
          onClick: () => loadAll(),
          disabled: loading,
          className: "relative z-10 shrink-0 rounded-full border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-semibold shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50",
          children: loading ? "Refreshing…" : "↻ Refresh"
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "mb-6 flex flex-wrap gap-2",
        children: TABS2.map((t) => /* @__PURE__ */ jsx("button", {
          onClick: () => setTab(t.id),
          className: `rounded-full border-2 px-4 py-1.5 font-['Satoshi'] text-sm font-semibold transition-all ${tab === t.id ? "border-neutral-900 bg-violet-500 text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"}`,
          children: t.label
        }, t.id))
      }), tab === "overview" && /* @__PURE__ */ jsx("div", {
        children: overview ? /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsxs("div", {
            className: "mb-4 grid grid-cols-2 gap-4 md:grid-cols-4",
            children: [/* @__PURE__ */ jsx(StatCard, {
              num: overview.students.active_today ?? 0,
              label: "Active today",
              sub: `${overview.students.active_last_hour ?? 0} in last hour · ${overview.students.active_this_week} this week`,
              color: "purple"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: overview.students.total,
              label: "Total Students",
              sub: `${overview.students.active_this_month} active this month`,
              color: "blue"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: overview.dna.total_generated,
              label: "DNAs Built",
              sub: `${overview.dna.accuracy_rate}% accuracy`,
              color: "green"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: `${funnel2?.overall_completion_rate ?? 0}%`,
              label: "Completion Rate",
              sub: "landing → roadmap",
              color: "red"
            })]
          }), (() => {
            const series = activeGranularity === "hour" ? overview.active_per_hour : activeGranularity === "week" ? overview.active_per_week : overview.active_per_month;
            const meta2 = {
              hour: {
                title: "Active users per hour",
                sub: `Distinct students who sent a message, last 24 hours (${chartTz})`,
                labelEvery: 2
              },
              week: {
                title: "Active users per week",
                sub: "Distinct active students per week, last 12 weeks",
                labelEvery: 2
              },
              month: {
                title: "Active users per month",
                sub: "Distinct active students per month, last 12 months",
                labelEvery: 2
              }
            }[activeGranularity];
            if (!series || series.length === 0) return null;
            const max = Math.max(...series.map((x) => x.active_users), 1);
            return /* @__PURE__ */ jsxs("div", {
              className: "mb-6 rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "mb-1 flex items-start justify-between gap-3",
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("h3", {
                    className: "font-['Clash_Display'] text-base font-bold",
                    children: meta2.title
                  }), /* @__PURE__ */ jsx("p", {
                    className: "text-xs text-neutral-500",
                    children: meta2.sub
                  })]
                }), /* @__PURE__ */ jsxs("div", {
                  className: "flex flex-shrink-0 items-center gap-2",
                  children: [activeGranularity === "hour" && /* @__PURE__ */ jsx("div", {
                    className: "flex rounded-full border-2 border-neutral-900 p-0.5",
                    children: ["IST", "UTC"].map((tz) => /* @__PURE__ */ jsx("button", {
                      onClick: () => setChartTz(tz),
                      className: `rounded-full px-2.5 py-1 text-xs font-bold transition-all ${chartTz === tz ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"}`,
                      children: tz
                    }, tz))
                  }), /* @__PURE__ */ jsx("div", {
                    className: "flex rounded-full border-2 border-neutral-900 p-0.5",
                    children: ["hour", "week", "month"].map((g) => /* @__PURE__ */ jsx("button", {
                      onClick: () => {
                        setActiveGranularity(g);
                        setActiveBucket(null);
                        setBucketStudents(null);
                      },
                      className: `rounded-full px-3 py-1 text-xs font-bold capitalize transition-all ${activeGranularity === g ? "bg-violet-500 text-white" : "text-neutral-500 hover:text-neutral-900"}`,
                      children: g
                    }, g))
                  })]
                })]
              }), /* @__PURE__ */ jsx("div", {
                className: "mt-4 flex items-end gap-1",
                style: {
                  height: 120
                },
                children: series.map((h, i) => {
                  const pct2 = h.active_users / max * 100;
                  const dispLabel = activeGranularity === "hour" && h.hour ? new Date(h.hour).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    hour12: true,
                    timeZone: chartTz === "UTC" ? "UTC" : "Asia/Kolkata"
                  }).toLowerCase().replace(" ", " ") : h.label;
                  return /* @__PURE__ */ jsxs("div", {
                    className: "group flex flex-1 flex-col items-center justify-end",
                    style: {
                      height: "100%"
                    },
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "mb-1 text-[10px] font-bold text-neutral-700 opacity-0 group-hover:opacity-100",
                      children: h.active_users
                    }), /* @__PURE__ */ jsx("div", {
                      onClick: () => {
                        if (h.active_users > 0) loadBucketStudents(h.hour, dispLabel);
                      },
                      className: `w-full rounded-t ${h.active_users > 0 ? "cursor-pointer hover:opacity-80" : ""}`,
                      style: {
                        height: `${Math.max(pct2, h.active_users > 0 ? 6 : 1)}%`,
                        background: h.active_users > 0 ? "#7c3aed" : "#e5e7eb",
                        transition: "height 0.6s ease"
                      },
                      title: h.active_users > 0 ? `${dispLabel}: ${h.active_users} active — click to see who` : `${dispLabel}: 0 active`
                    }), i % meta2.labelEvery === 0 && /* @__PURE__ */ jsx("div", {
                      className: "mt-1 text-[9px] text-neutral-400",
                      children: dispLabel
                    })]
                  }, i);
                })
              }), activeBucket && /* @__PURE__ */ jsxs("div", {
                className: "mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "mb-2 flex items-center justify-between",
                  children: [/* @__PURE__ */ jsxs("span", {
                    className: "text-xs font-bold text-neutral-700",
                    children: ["Active in ", activeBucket.label, bucketStudents ? ` · ${bucketStudents.length} ${bucketStudents.length === 1 ? "person" : "people"}` : ""]
                  }), /* @__PURE__ */ jsx("button", {
                    onClick: () => {
                      setActiveBucket(null);
                      setBucketStudents(null);
                    },
                    className: "text-xs font-semibold text-neutral-400 hover:text-neutral-900",
                    children: "Close"
                  })]
                }), loadingBucket ? /* @__PURE__ */ jsx("p", {
                  className: "text-xs text-neutral-400",
                  children: "Loading…"
                }) : bucketStudents && bucketStudents.length ? /* @__PURE__ */ jsx("div", {
                  className: "space-y-1.5",
                  children: bucketStudents.map((st) => /* @__PURE__ */ jsxs("button", {
                    onClick: () => openStudentPanel(st.id),
                    className: "flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left hover:bg-violet-50",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: "min-w-0 flex-1 truncate text-sm font-semibold text-neutral-800",
                      children: st.name || st.email || (st.missing ? "(record missing)" : "Anonymous student")
                    }), st.email && st.name && /* @__PURE__ */ jsx("span", {
                      className: "mx-2 truncate text-xs text-neutral-400",
                      children: st.email
                    }), /* @__PURE__ */ jsx("span", {
                      className: "shrink-0 text-xs font-bold text-violet-600",
                      children: "View →"
                    })]
                  }, st.id))
                }) : /* @__PURE__ */ jsx("p", {
                  className: "text-xs text-neutral-400",
                  children: "No students found for this bucket."
                })]
              })]
            });
          })(), /* @__PURE__ */ jsxs("div", {
            className: "mb-6 grid gap-6 md:grid-cols-2",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsx("h3", {
                className: "mb-4 font-['Clash_Display'] text-base font-bold",
                children: "Conversion Funnel"
              }), (funnel2?.funnel_stages ?? []).map((stage, i) => {
                const max = Math.max(...(funnel2?.funnel_stages ?? []).map((s) => s.count), 1);
                return /* @__PURE__ */ jsxs("div", {
                  className: "mb-3 flex items-center gap-3",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "w-36 flex-shrink-0 text-xs font-semibold",
                    children: stage.stage
                  }), /* @__PURE__ */ jsx("div", {
                    className: "flex-1 overflow-hidden rounded-full bg-neutral-100",
                    style: {
                      height: 22
                    },
                    children: /* @__PURE__ */ jsx("div", {
                      className: "flex h-full items-center rounded-full pl-2",
                      style: {
                        width: `${Math.max(stage.count / max * 100, 2)}%`,
                        background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                        transition: "width 0.8s ease"
                      },
                      children: /* @__PURE__ */ jsx("span", {
                        className: "text-xs font-bold text-white",
                        children: stage.count
                      })
                    })
                  }), /* @__PURE__ */ jsxs("div", {
                    className: `w-10 text-right text-xs font-semibold ${stage.conversion_rate < 30 ? "text-red-500" : "text-neutral-400"}`,
                    children: [stage.conversion_rate, "%"]
                  })]
                }, stage.stage);
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsx("h3", {
                className: "mb-4 font-['Clash_Display'] text-base font-bold",
                children: "Drop-off Hotspots"
              }), [...dropoffs?.dropoff_by_stage ?? []].sort((a, b) => b.count - a.count).slice(0, 5).map((d) => /* @__PURE__ */ jsxs("div", {
                className: "flex items-center justify-between border-b border-neutral-100 py-3 last:border-0",
                children: [/* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "text-sm font-semibold",
                    children: d.stage
                  }), /* @__PURE__ */ jsxs("div", {
                    className: "text-xs text-neutral-400",
                    children: [d.avg_messages_before_dropoff.toFixed(1), " msgs before leaving"]
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  className: "text-2xl font-black text-red-500",
                  children: d.count
                })]
              }, d.stage))]
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "mb-4 font-['Clash_Display'] text-base font-bold",
              children: "Top Score Improvers"
            }), (scores?.top_improvers ?? []).slice(0, 5).length ? (scores?.top_improvers ?? []).slice(0, 5).map((im) => /* @__PURE__ */ jsxs("div", {
              className: "flex items-center justify-between border-b border-neutral-100 py-2 last:border-0",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "min-w-0 flex-1",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "truncate text-sm font-semibold text-neutral-800",
                  children: im.name || im.email || "Unnamed student"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "truncate font-mono text-[10px] text-neutral-300",
                  children: [im.student_id.slice(0, 8), "…"]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex flex-shrink-0 items-center gap-2 text-sm",
                children: [/* @__PURE__ */ jsx("span", {
                  className: "text-neutral-400",
                  children: im.from_score
                }), /* @__PURE__ */ jsx("span", {
                  className: "text-neutral-300",
                  children: "→"
                }), /* @__PURE__ */ jsx("span", {
                  className: "font-bold",
                  children: im.to_score
                }), /* @__PURE__ */ jsxs("span", {
                  className: "font-bold text-emerald-600",
                  children: ["+", im.improvement]
                })]
              })]
            }, im.student_id)) : /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-400",
              children: "No score movements yet."
            })]
          }), locations && (locations.cities.length > 0 || locations.countries.length > 0) && /* @__PURE__ */ jsxs("div", {
            className: "mt-6 grid gap-6 md:grid-cols-2",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsx("h3", {
                className: "mb-1 font-['Clash_Display'] text-base font-bold",
                children: "Top Cities"
              }), /* @__PURE__ */ jsxs("p", {
                className: "mb-4 text-xs text-neutral-500",
                children: ["From most recent login IP · ", locations.located, " of ", locations.total_with_email, " located"]
              }), /* @__PURE__ */ jsx(BarList, {
                items: locations.cities.slice(0, 8).map((c) => ({
                  label: c.name,
                  count: c.count
                })),
                color: "#7c3aed"
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
              children: [/* @__PURE__ */ jsx("h3", {
                className: "mb-1 font-['Clash_Display'] text-base font-bold",
                children: "Top Countries"
              }), /* @__PURE__ */ jsx("p", {
                className: "mb-4 text-xs text-neutral-500",
                children: "Where your students sign in from"
              }), /* @__PURE__ */ jsx(BarList, {
                items: locations.countries.slice(0, 8).map((c) => ({
                  label: c.name,
                  count: c.count
                })),
                color: "#10B981"
              })]
            })]
          })]
        }) : /* @__PURE__ */ jsx(EmptyState, {
          loading
        })
      }), tab === "funnel" && /* @__PURE__ */ jsxs("div", {
        className: "space-y-6",
        children: [funnel2?.biggest_drop_off_detail && /* @__PURE__ */ jsxs("div", {
          className: "rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-[4px_4px_0px_0px_rgba(239,68,68,0.4)]",
          children: [/* @__PURE__ */ jsx("div", {
            className: "text-xs font-bold uppercase tracking-widest text-red-500",
            children: "Biggest drop-off"
          }), /* @__PURE__ */ jsx("div", {
            className: "mt-1 font-['Clash_Display'] text-lg font-bold text-neutral-900",
            children: funnel2.biggest_drop_off
          }), /* @__PURE__ */ jsx("div", {
            className: "text-sm text-neutral-600",
            children: funnel2.biggest_drop_off_detail
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("h3", {
            className: "mb-1 font-['Clash_Display'] text-base font-bold",
            children: "The full journey, step by step"
          }), /* @__PURE__ */ jsx("p", {
            className: "mb-5 text-xs text-neutral-500",
            children: "Each bar shows students who reached that step. % of previous step is where the drop happens."
          }), (funnel2?.funnel_stages ?? []).map((stage, i) => {
            const max = Math.max(...(funnel2?.funnel_stages ?? []).map((s) => s.count), 1);
            const isBiggest = stage.stage === funnel2?.biggest_drop_off;
            const stepConv = stage.step_conversion_rate ?? stage.conversion_rate;
            return /* @__PURE__ */ jsxs("div", {
              className: "mb-5",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "mb-1 flex items-center justify-between",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-2 text-sm font-semibold",
                  children: [/* @__PURE__ */ jsxs("span", {
                    className: "text-neutral-400",
                    children: [i + 1, "."]
                  }), " ", stage.stage, isBiggest && /* @__PURE__ */ jsx("span", {
                    className: "rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600",
                    children: "biggest drop"
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-neutral-400",
                  children: stage.note
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-3",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "flex-1 overflow-hidden rounded-full bg-neutral-100",
                  style: {
                    height: 28
                  },
                  children: /* @__PURE__ */ jsx("div", {
                    className: "flex h-full items-center rounded-full pl-3",
                    style: {
                      width: `${Math.max(stage.count / max * 100, 3)}%`,
                      background: isBiggest ? "#EF4444" : FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                      transition: "width 0.8s ease"
                    },
                    children: /* @__PURE__ */ jsxs("span", {
                      className: "whitespace-nowrap text-xs font-bold text-white",
                      children: [stage.count, " students"]
                    })
                  })
                }), /* @__PURE__ */ jsxs("div", {
                  className: "w-28 text-right text-xs",
                  children: [/* @__PURE__ */ jsxs("span", {
                    className: `font-bold ${stepConv < 60 ? "text-red-500" : "text-neutral-700"}`,
                    children: [stepConv, "%"]
                  }), /* @__PURE__ */ jsx("span", {
                    className: "text-neutral-400",
                    children: " of prev"
                  }), !!stage.dropped_from_prev && /* @__PURE__ */ jsxs("div", {
                    className: "text-[11px] text-red-400",
                    children: ["−", stage.dropped_from_prev, " dropped"]
                  })]
                })]
              })]
            }, stage.stage);
          }), !(funnel2?.funnel_stages ?? []).length && /* @__PURE__ */ jsx(EmptyState, {
            loading
          })]
        }), funnel2?.profiling_depth && /* @__PURE__ */ jsxs("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("h3", {
            className: "mb-1 font-['Clash_Display'] text-base font-bold",
            children: "Conversation depth"
          }), /* @__PURE__ */ jsxs("p", {
            className: "mb-4 text-xs text-neutral-500",
            children: ["How many messages students send. Profiling usually needs ~7+ to complete — short conversations are where DNA never gets built. Average: ", /* @__PURE__ */ jsxs("span", {
              className: "font-bold text-neutral-700",
              children: [funnel2.profiling_depth.avg_user_messages, " messages"]
            })]
          }), Object.entries(funnel2.profiling_depth.buckets).map(([bucket, count]) => {
            const vals = Object.values(funnel2.profiling_depth.buckets);
            const max = Math.max(...vals, 1);
            return /* @__PURE__ */ jsxs("div", {
              className: "mb-2 flex items-center gap-3",
              children: [/* @__PURE__ */ jsx("div", {
                className: "w-20 flex-shrink-0 text-xs font-semibold",
                children: bucket
              }), /* @__PURE__ */ jsx("div", {
                className: "flex-1 overflow-hidden rounded-full bg-neutral-100",
                style: {
                  height: 20
                },
                children: /* @__PURE__ */ jsx("div", {
                  className: "flex h-full items-center rounded-full pl-2",
                  style: {
                    width: `${Math.max(count / max * 100, 3)}%`,
                    background: "#7c3aed"
                  },
                  children: /* @__PURE__ */ jsx("span", {
                    className: "text-[11px] font-bold text-white",
                    children: count
                  })
                })
              })]
            }, bucket);
          })]
        }), funnel2?.side_actions && /* @__PURE__ */ jsxs("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsx("h3", {
            className: "mb-4 font-['Clash_Display'] text-base font-bold",
            children: "Engagement actions"
          }), /* @__PURE__ */ jsx("div", {
            className: "grid grid-cols-2 gap-4 md:grid-cols-3",
            children: [["Uploaded resume", funnel2.side_actions.uploaded_resume], ["Logged a check-in", funnel2.side_actions.logged_check_in], ["Clicked Resume Maker", funnel2.side_actions.clicked_resume_maker], ["Clicked Outreach Dojo", funnel2.side_actions.clicked_outreach_dojo], ["Clicked any tool", funnel2.side_actions.clicked_any_tool], ["Explored a new path", funnel2.side_actions.explored_new_path]].map(([label, val]) => /* @__PURE__ */ jsxs("div", {
              className: "rounded-xl border border-neutral-200 p-3",
              children: [/* @__PURE__ */ jsx("div", {
                className: "text-2xl font-black text-neutral-900",
                children: val
              }), /* @__PURE__ */ jsx("div", {
                className: "text-xs text-neutral-500",
                children: label
              })]
            }, label))
          })]
        })]
      }), tab === "dropouts" && /* @__PURE__ */ jsx("div", {
        className: "space-y-6",
        children: loadingDropouts && !dropouts ? /* @__PURE__ */ jsx(EmptyState, {
          loading: true
        }) : dropouts ? /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsxs("div", {
            className: "grid grid-cols-2 gap-4 md:grid-cols-4",
            children: [/* @__PURE__ */ jsx(StatCard, {
              num: dropouts.total_dropped,
              label: "Dropped in profiling",
              sub: "reached profiling, never got a DNA",
              color: "red"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: `${dropouts.avg_minutes}m`,
              label: "Avg time before drop",
              sub: `${dropouts.avg_messages} messages avg`,
              color: "amber"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: dropouts.speed_distribution.under_1min,
              label: "Dropped under 1 min",
              sub: "fast / first-impression drops",
              color: "purple"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: dropouts.returned_and_converted,
              label: "Returned & converted",
              sub: `${dropouts.returned_count} dropped students came back`,
              color: "green"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "mb-1 font-['Clash_Display'] text-base font-bold",
              children: "How fast they leave"
            }), /* @__PURE__ */ jsx("p", {
              className: "mb-4 text-xs text-neutral-500",
              children: "Fast drops (under a few minutes) usually mean a first-impression problem, not profiling fatigue."
            }), [["Under 1 minute", dropouts.speed_distribution.under_1min, "#EF4444"], ["1–3 minutes", dropouts.speed_distribution["1_3min"], "#F59E0B"], ["3–10 minutes", dropouts.speed_distribution["3_10min"], "#8B5CF6"], ["Over 10 minutes", dropouts.speed_distribution.over_10min, "#10B981"]].map(([label, n, color]) => {
              const max = Math.max(dropouts.total_dropped, 1);
              return /* @__PURE__ */ jsxs("div", {
                className: "mb-2 flex items-center gap-3",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "w-32 flex-shrink-0 text-xs font-semibold",
                  children: label
                }), /* @__PURE__ */ jsx("div", {
                  className: "flex-1 overflow-hidden rounded-full bg-neutral-100",
                  style: {
                    height: 20
                  },
                  children: /* @__PURE__ */ jsx("div", {
                    className: "flex h-full items-center rounded-full pl-2",
                    style: {
                      width: `${Math.max(n / max * 100, n > 0 ? 6 : 0)}%`,
                      background: color
                    },
                    children: n > 0 && /* @__PURE__ */ jsx("span", {
                      className: "text-[11px] font-bold text-white",
                      children: n
                    })
                  })
                })]
              }, label);
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "mb-1 font-['Clash_Display'] text-base font-bold",
              children: "Who dropped — and what they last said"
            }), /* @__PURE__ */ jsx("p", {
              className: "mb-4 text-xs text-neutral-500",
              children: "Sorted fastest-drop first. Click a student to read their last messages and spot the pattern."
            }), dropouts.droppers.length ? dropouts.droppers.map((d) => {
              const isOpen = openDropper === d.student_id;
              const speedColor = {
                under_1min: "bg-red-100 text-red-700",
                "1_3min": "bg-amber-100 text-amber-800",
                "3_10min": "bg-violet-100 text-violet-700",
                over_10min: "bg-emerald-100 text-emerald-700"
              };
              return /* @__PURE__ */ jsxs("div", {
                className: "border-b border-neutral-100 py-3 last:border-0",
                children: [/* @__PURE__ */ jsxs("button", {
                  onClick: () => setOpenDropper(isOpen ? null : d.student_id),
                  className: "flex w-full items-center justify-between gap-3 text-left",
                  children: [/* @__PURE__ */ jsxs("div", {
                    className: "min-w-0 flex-1",
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "truncate text-sm font-semibold text-neutral-800",
                      children: d.name || d.email || "Unnamed student"
                    }), /* @__PURE__ */ jsxs("div", {
                      className: "text-[11px] text-neutral-400",
                      children: [d.total_messages, " msgs · ", d.minutes_in_chat, "m · died at ", d.furthest_state, d.returned ? " · returned later" : ""]
                    })]
                  }), /* @__PURE__ */ jsx("span", {
                    className: `shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${speedColor[d.drop_speed] || "bg-neutral-100 text-neutral-500"}`,
                    children: d.drop_speed.replace("_", "–").replace("min", " min")
                  }), /* @__PURE__ */ jsx("span", {
                    className: "shrink-0 text-xs font-bold text-violet-600",
                    children: isOpen ? "Hide" : "Read →"
                  })]
                }), isOpen && /* @__PURE__ */ jsxs("div", {
                  className: "mt-3 space-y-2 rounded-xl bg-neutral-50 p-3",
                  children: [d.last_messages.map((m, i) => /* @__PURE__ */ jsx("div", {
                    className: `flex ${m.role === "user" ? "justify-end" : "justify-start"}`,
                    children: /* @__PURE__ */ jsx("div", {
                      className: `max-w-[80%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed ${m.role === "user" ? "bg-violet-500 text-white" : "border border-neutral-200 bg-white text-neutral-800"}`,
                      children: renderAdminMsg(m.content)
                    })
                  }, i)), /* @__PURE__ */ jsx("button", {
                    onClick: () => openStudentPanel(d.student_id),
                    className: "mt-1 text-xs font-bold text-violet-600 hover:text-violet-800",
                    children: "Open full profile →"
                  })]
                })]
              }, d.student_id);
            }) : /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-400",
              children: "No dropouts found."
            })]
          })]
        }) : /* @__PURE__ */ jsx(EmptyState, {
          loading
        })
      }), tab === "students" && /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsx("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] overflow-x-auto",
          children: /* @__PURE__ */ jsxs("table", {
            className: "w-full min-w-[1100px] border-collapse",
            children: [/* @__PURE__ */ jsx("thead", {
              children: /* @__PURE__ */ jsx("tr", {
                className: "bg-neutral-50",
                children: ["ID · Last used", "Name", "Email", "Sign-in", "Location", "Tools used", "Sessions", "Reached", "Resume", "Last Seen", ""].map((h) => /* @__PURE__ */ jsx("th", {
                  className: "border-b-2 border-neutral-900 px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400",
                  children: h
                }, h))
              })
            }), /* @__PURE__ */ jsx("tbody", {
              children: students.length ? [...students].sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || "")).map((s) => /* @__PURE__ */ jsxs("tr", {
                onClick: () => openStudentPanel(s.id),
                className: "cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-violet-50/40",
                children: [/* @__PURE__ */ jsxs("td", {
                  className: "px-4 py-3",
                  title: s.id,
                  children: [/* @__PURE__ */ jsxs("div", {
                    className: "font-mono text-xs text-neutral-300",
                    children: [s.id.slice(0, 8), "…"]
                  }), /* @__PURE__ */ jsx("div", {
                    className: "mt-0.5 text-[11px] font-semibold text-neutral-600",
                    title: `Last used: ${fmtDateTime(s.last_seen)}`,
                    children: fmtDateTime(s.last_seen)
                  })]
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 text-sm font-semibold",
                  children: s.name || "—"
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 text-xs text-neutral-500",
                  children: s.email || "—"
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 text-xs",
                  children: s.main_platform?.linked ? /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "font-semibold text-neutral-700",
                      children: s.main_platform.signup_method
                    }), /* @__PURE__ */ jsxs("div", {
                      className: "text-[10px] text-neutral-400",
                      children: ["signed up ", fmtDate(s.main_platform.signed_up_at)]
                    })]
                  }) : s.email ? /* @__PURE__ */ jsx("span", {
                    className: "text-[10px] text-neutral-300",
                    title: "No studojo.com account matches this email",
                    children: "not linked"
                  }) : /* @__PURE__ */ jsx("span", {
                    className: "text-[10px] text-neutral-300",
                    children: "no email"
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 text-xs",
                  children: s.location && (s.location.city || s.location.country) ? /* @__PURE__ */ jsxs("div", {
                    children: [/* @__PURE__ */ jsx("div", {
                      className: "font-semibold text-neutral-700",
                      children: s.location.city || s.location.country
                    }), s.location.city && s.location.country && /* @__PURE__ */ jsx("div", {
                      className: "text-[10px] text-neutral-400",
                      children: s.location.country
                    })]
                  }) : /* @__PURE__ */ jsx("span", {
                    className: "text-[10px] text-neutral-300",
                    children: "—"
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: s.main_platform?.linked ? /* @__PURE__ */ jsx("div", {
                    className: "flex flex-wrap gap-1",
                    children: [["Resume", s.main_platform.resume_count], ["Internship", s.main_platform.internship_count], ["Apply", s.main_platform.career_app_count]].map(([label, n]) => /* @__PURE__ */ jsxs("span", {
                      className: `rounded-full px-2 py-0.5 text-[10px] font-bold ${n > 0 ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-300"}`,
                      title: `${label}: ${n}`,
                      children: [label, " ", n]
                    }, label))
                  }) : /* @__PURE__ */ jsx("span", {
                    className: "text-xs text-neutral-300",
                    children: "—"
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 text-sm font-semibold",
                  children: s.session_count
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: (() => {
                    const stage = s.reached_stage || "Greeting";
                    const cls = {
                      "Roadmap": "bg-emerald-100 text-emerald-700",
                      "Career Analysis": "bg-violet-100 text-violet-700",
                      "Profiling": "bg-amber-100 text-amber-800",
                      "Greeting": "bg-neutral-100 text-neutral-500"
                    };
                    return /* @__PURE__ */ jsxs("div", {
                      className: "flex flex-col gap-0.5",
                      children: [/* @__PURE__ */ jsx("span", {
                        className: `inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-bold ${cls[stage] ?? cls["Greeting"]}`,
                        children: stage
                      }), s.dashboard_ready && /* @__PURE__ */ jsx("span", {
                        className: "text-[9px] font-semibold text-emerald-600",
                        children: "dashboard ready"
                      })]
                    });
                  })()
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: s.has_resume ? /* @__PURE__ */ jsxs("button", {
                    onClick: (e) => {
                      e.stopPropagation();
                      viewResume(s.id, s.name || s.email || "Student");
                    },
                    className: "flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 hover:bg-white",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: "inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                    }), "View resume"]
                  }) : /* @__PURE__ */ jsx("span", {
                    className: "text-xs text-neutral-300",
                    children: "—"
                  })
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3 text-xs text-neutral-400",
                  children: fmtDate(s.last_seen)
                }), /* @__PURE__ */ jsx("td", {
                  className: "px-4 py-3",
                  children: /* @__PURE__ */ jsx("button", {
                    onClick: (e) => {
                      e.stopPropagation();
                      openStudentPanel(s.id);
                    },
                    className: "rounded-full border-2 border-neutral-900 bg-white px-3 py-1 text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50",
                    children: "View →"
                  })
                })]
              }, s.id)) : /* @__PURE__ */ jsx("tr", {
                children: /* @__PURE__ */ jsx("td", {
                  colSpan: 11,
                  className: "px-4 py-10 text-center text-sm text-neutral-400",
                  children: loading ? "Loading…" : "No students yet."
                })
              })
            })]
          })
        }), /* @__PURE__ */ jsx(AnonSessionsPanel, {
          ccHeaders
        })]
      }), tab === "scores" && /* @__PURE__ */ jsx("div", {
        children: scores ? /* @__PURE__ */ jsxs(Fragment, {
          children: [/* @__PURE__ */ jsxs("div", {
            className: "mb-6 grid grid-cols-3 gap-4",
            children: [/* @__PURE__ */ jsx(StatCard, {
              num: scores.students_who_improved,
              label: "Students Improved",
              color: "green"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: `+${Math.round(scores.avg_readiness_improvement ?? 0)}`,
              label: "Avg Score Gain",
              color: "purple"
            }), /* @__PURE__ */ jsx(StatCard, {
              num: scores.total_actions_completed,
              label: "Actions Completed",
              color: "amber"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "mb-5 font-['Clash_Display'] text-base font-bold",
              children: "Top Improvers"
            }), scores.top_improvers?.length ? scores.top_improvers.map((im) => /* @__PURE__ */ jsxs("div", {
              className: "flex items-center gap-3 border-b border-neutral-100 py-3 last:border-0",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "min-w-0 flex-1",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "truncate text-sm font-semibold text-neutral-800",
                  children: im.name || im.email || "Unnamed student"
                }), im.email && im.name && /* @__PURE__ */ jsx("div", {
                  className: "truncate text-xs text-neutral-400",
                  children: im.email
                }), /* @__PURE__ */ jsxs("div", {
                  className: "truncate font-mono text-[10px] text-neutral-300",
                  children: [im.student_id.slice(0, 8), "…"]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex flex-shrink-0 items-center gap-2 text-sm",
                children: [/* @__PURE__ */ jsx("span", {
                  className: "text-neutral-400",
                  children: im.from_score
                }), /* @__PURE__ */ jsx("span", {
                  className: "text-neutral-300",
                  children: "→"
                }), /* @__PURE__ */ jsx("span", {
                  className: "font-bold",
                  children: im.to_score
                }), /* @__PURE__ */ jsxs("span", {
                  className: "font-bold text-emerald-600",
                  children: ["+", im.improvement, " pts"]
                })]
              }), /* @__PURE__ */ jsx("button", {
                onClick: () => openStudentPanel(im.student_id),
                className: "rounded-full border-2 border-neutral-900 bg-white px-3 py-1 text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50",
                children: "View →"
              })]
            }, im.student_id)) : /* @__PURE__ */ jsx("p", {
              className: "text-sm text-neutral-400",
              children: "No improvements tracked yet."
            })]
          })]
        }) : /* @__PURE__ */ jsx(EmptyState, {
          loading
        })
      }), tab === "paths" && /* @__PURE__ */ jsxs("div", {
        className: "space-y-6",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "grid gap-6 md:grid-cols-2",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "mb-1 font-['Clash_Display'] text-base font-bold",
              children: "Top Target Roles"
            }), /* @__PURE__ */ jsx("p", {
              className: "mb-4 text-xs text-neutral-400",
              children: "Click a role to see who's targeting it"
            }), /* @__PURE__ */ jsx(BarList, {
              items: (paths?.top_target_roles ?? []).map((r) => ({
                label: r.role,
                count: r.count
              })),
              color: "var(--color-violet-500, #8B5CF6)",
              onLabelClick: (label) => loadPathDrilldown(label, "role")
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "mb-1 font-['Clash_Display'] text-base font-bold",
              children: "Top Target Industries"
            }), /* @__PURE__ */ jsx("p", {
              className: "mb-4 text-xs text-neutral-400",
              children: "Click an industry to see who's targeting it"
            }), /* @__PURE__ */ jsx(BarList, {
              items: (paths?.top_target_industries ?? []).slice(0, 8).map((i) => ({
                label: i.industry,
                count: i.count
              })),
              color: "#3B82F6",
              onLabelClick: (label) => loadPathDrilldown(label, "industry")
            })]
          })]
        }), pathDrilldown && /* @__PURE__ */ jsxs("div", {
          className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "mb-4 flex items-center justify-between",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("div", {
                className: "text-xs font-bold uppercase tracking-widest text-neutral-400",
                children: pathDrilldown.type === "role" ? "Targeting role" : "Targeting industry"
              }), /* @__PURE__ */ jsx("h3", {
                className: "font-['Clash_Display'] text-lg font-bold",
                children: pathDrilldown.label
              })]
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => setPathDrilldown(null),
              className: "rounded-full border-2 border-neutral-300 px-3 py-1 text-xs font-bold text-neutral-500 hover:border-neutral-900 hover:text-neutral-900",
              children: "✕ Close"
            })]
          }), pathDrilldown.loading ? /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-400",
            children: "Loading…"
          }) : pathDrilldown.students.length === 0 ? /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-400",
            children: "No students found."
          }) : /* @__PURE__ */ jsx("div", {
            className: "divide-y divide-neutral-100",
            children: pathDrilldown.students.map((s) => /* @__PURE__ */ jsxs("div", {
              className: "flex items-center justify-between py-3",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "min-w-0",
                children: [/* @__PURE__ */ jsx("button", {
                  className: "truncate text-sm font-bold text-neutral-800 hover:text-violet-600 text-left",
                  onClick: () => {
                    setTab("students");
                    openStudentPanel(s.id);
                  },
                  children: s.name || s.email || s.id.slice(0, 8)
                }), s.email && s.name && /* @__PURE__ */ jsx("div", {
                  className: "truncate text-xs text-neutral-400",
                  children: s.email
                }), pathDrilldown.type === "role" && s.target_industry && /* @__PURE__ */ jsxs("div", {
                  className: "text-xs text-neutral-400",
                  children: ["Industry: ", s.target_industry]
                }), pathDrilldown.type === "industry" && s.target_role && /* @__PURE__ */ jsxs("div", {
                  className: "text-xs text-neutral-400",
                  children: ["Role: ", s.target_role]
                })]
              }), s.last_seen && /* @__PURE__ */ jsx("div", {
                className: "shrink-0 text-xs text-neutral-400",
                children: fmtDateTime(s.last_seen)
              })]
            }, s.id))
          })]
        })]
      }), tab === "questions" && /* @__PURE__ */ jsxs("div", {
        className: "rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]",
        children: [/* @__PURE__ */ jsx("h3", {
          className: "mb-5 font-['Clash_Display'] text-base font-bold",
          children: "Recent Student Questions"
        }), (() => {
          const qs = questions?.recent_questions ?? questions?.questions ?? [];
          return qs.length ? qs.map((item, i) => {
            const text = item.question ?? item.content ?? item.text ?? JSON.stringify(item);
            const state = item.state ?? "—";
            const time = item.created_at ? fmtDateTime(item.created_at) : "";
            return /* @__PURE__ */ jsxs("div", {
              className: "border-b border-neutral-100 py-3 last:border-0",
              children: [/* @__PURE__ */ jsx("div", {
                className: "mb-1 text-sm font-semibold",
                children: text.length > 200 ? text.slice(0, 200) + "…" : text
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex items-center gap-2 text-xs text-neutral-400",
                children: [/* @__PURE__ */ jsx("span", {
                  className: `rounded-full px-2 py-0.5 font-semibold ${STATE_PILL[state] ?? "bg-neutral-100 text-neutral-500"}`,
                  children: state
                }), time && /* @__PURE__ */ jsx("span", {
                  children: time
                })]
              })]
            }, i);
          }) : /* @__PURE__ */ jsx("p", {
            className: "text-sm text-neutral-400",
            children: "No question data yet — fills as students chat."
          });
        })()]
      })]
    }), /* @__PURE__ */ jsx(AnimatePresence, {
      children: selectedStudent && /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsx(motion.div, {
          initial: {
            opacity: 0
          },
          animate: {
            opacity: 0.3
          },
          exit: {
            opacity: 0
          },
          className: "fixed inset-0 z-40 bg-black",
          onClick: () => setSelectedStudent(null)
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            x: "100%"
          },
          animate: {
            x: 0
          },
          exit: {
            x: "100%"
          },
          transition: {
            type: "spring",
            stiffness: 300,
            damping: 30
          },
          className: "fixed bottom-0 right-0 top-0 z-50 w-full max-w-md overflow-y-auto border-l-2 border-neutral-900 bg-white p-7 shadow-[-8px_0_0_0_rgba(25,26,35,0.05)]",
          children: [/* @__PURE__ */ jsx("button", {
            onClick: () => setSelectedStudent(null),
            className: "absolute right-5 top-5 text-xl font-bold text-neutral-400 hover:text-neutral-900",
            children: "✕"
          }), loadingDetail ? /* @__PURE__ */ jsx("div", {
            className: "flex h-40 items-center justify-center text-neutral-400",
            children: "Loading…"
          }) : studentDetail ? /* @__PURE__ */ jsx(StudentPanel, {
            id: selectedStudent,
            detail: studentDetail,
            activity: studentActivity,
            student: students.find((s) => s.id === selectedStudent),
            note: loadNote(selectedStudent),
            onSaveNote: (note) => saveNote(selectedStudent, note),
            transcripts,
            showTranscripts,
            loadingTranscripts,
            onViewTranscripts: () => loadTranscripts(selectedStudent),
            onHideTranscripts: () => setShowTranscripts(false)
          }) : /* @__PURE__ */ jsx("p", {
            className: "text-sm text-red-500",
            children: "Could not load student data."
          })]
        })]
      })
    }), /* @__PURE__ */ jsx(AnimatePresence, {
      children: resumeViewFor && /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsx(motion.div, {
          initial: {
            opacity: 0
          },
          animate: {
            opacity: 0.4
          },
          exit: {
            opacity: 0
          },
          className: "fixed inset-0 z-[60] bg-black",
          onClick: () => {
            setResumeViewFor(null);
            setResumeView(null);
          }
        }), /* @__PURE__ */ jsxs(motion.div, {
          initial: {
            opacity: 0,
            scale: 0.96
          },
          animate: {
            opacity: 1,
            scale: 1
          },
          exit: {
            opacity: 0,
            scale: 0.96
          },
          className: "fixed left-1/2 top-1/2 z-[70] max-h-[85vh] w-[92vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "mb-4 flex items-start justify-between gap-3",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsxs("h3", {
                className: "font-['Clash_Display'] text-lg font-black",
                children: [resumeViewFor.name, "'s resume"]
              }), resumeView?.filename && /* @__PURE__ */ jsxs("div", {
                className: "text-xs text-neutral-400",
                children: [resumeView.filename, resumeView.uploaded_at ? ` · uploaded ${fmtDate(resumeView.uploaded_at)}` : ""]
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex items-center gap-2",
              children: [resumeView?.file_on_disk && /* @__PURE__ */ jsx("button", {
                onClick: () => downloadResume(resumeViewFor.id, resumeView?.filename ?? "resume"),
                className: "rounded-full border-2 border-neutral-900 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-white",
                children: "↓ Download file"
              }), /* @__PURE__ */ jsx("button", {
                onClick: () => {
                  setResumeViewFor(null);
                  setResumeView(null);
                },
                className: "text-xl font-bold text-neutral-400 hover:text-neutral-900",
                children: "✕"
              })]
            })]
          }), loadingResume ? /* @__PURE__ */ jsx("div", {
            className: "py-10 text-center text-sm text-neutral-400",
            children: "Loading resume…"
          }) : resumeView?.has_snapshot ? /* @__PURE__ */ jsxs("div", {
            className: "space-y-4",
            children: [!resumeView.file_on_disk && /* @__PURE__ */ jsx("p", {
              className: "rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700",
              children: "The original file isn't stored for this upload — showing the parsed resume content the coach extracted."
            }), resumeView.parsed && Object.keys(resumeView.parsed).length > 0 && /* @__PURE__ */ jsx("div", {
              className: "space-y-3",
              children: Object.entries(resumeView.parsed).map(([key, val]) => {
                if (val == null || Array.isArray(val) && val.length === 0 || val === "") return null;
                return /* @__PURE__ */ jsxs("div", {
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "mb-1 text-xs font-bold uppercase tracking-widest text-neutral-400",
                    children: key.replace(/_/g, " ")
                  }), /* @__PURE__ */ jsx("div", {
                    className: "rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-[12px] leading-relaxed text-neutral-800 whitespace-pre-wrap break-words",
                    children: typeof val === "string" || typeof val === "number" ? String(val) : JSON.stringify(val, null, 2)
                  })]
                }, key);
              })
            }), resumeView.text && /* @__PURE__ */ jsxs("details", {
              className: "rounded-lg border border-neutral-200",
              children: [/* @__PURE__ */ jsx("summary", {
                className: "cursor-pointer px-3 py-2 text-xs font-bold text-neutral-600",
                children: "Raw extracted text"
              }), /* @__PURE__ */ jsx("pre", {
                className: "max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-[11px] leading-relaxed text-neutral-700",
                children: resumeView.text
              })]
            })]
          }) : /* @__PURE__ */ jsx("p", {
            className: "py-10 text-center text-sm text-neutral-400",
            children: "No resume content stored for this student."
          })]
        })]
      })
    })]
  });
});
function EmptyState({
  loading
}) {
  return /* @__PURE__ */ jsx("div", {
    className: "flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 text-sm text-neutral-400",
    children: loading ? "Loading…" : "No data yet."
  });
}
function BarList({
  items,
  color,
  onLabelClick
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return items.length ? /* @__PURE__ */ jsx("div", {
    className: "space-y-3",
    children: items.map((item) => /* @__PURE__ */ jsxs("div", {
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-1 flex justify-between text-sm font-semibold",
        children: [onLabelClick ? /* @__PURE__ */ jsx("button", {
          className: "truncate text-left hover:text-violet-600 hover:underline",
          onClick: () => onLabelClick(item.label),
          children: item.label
        }) : /* @__PURE__ */ jsx("span", {
          children: item.label
        }), /* @__PURE__ */ jsx("span", {
          className: "shrink-0 pl-2",
          children: item.count
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "h-2 overflow-hidden rounded-full bg-neutral-100",
        children: /* @__PURE__ */ jsx("div", {
          className: "h-full rounded-full transition-all duration-700",
          style: {
            width: `${Math.round(item.count / max * 100)}%`,
            background: color
          }
        })
      })]
    }, item.label))
  }) : /* @__PURE__ */ jsx("p", {
    className: "text-sm text-neutral-400",
    children: "No data yet."
  });
}
function StudentPanel({
  id,
  detail,
  activity,
  student,
  note,
  onSaveNote,
  transcripts,
  showTranscripts,
  loadingTranscripts,
  onViewTranscripts,
  onHideTranscripts
}) {
  const [noteVal, setNoteVal] = useState(note);
  const p = detail.primary_path ?? {};
  const s = detail.student ?? {};
  return /* @__PURE__ */ jsxs("div", {
    children: [/* @__PURE__ */ jsx("h2", {
      className: "font-['Clash_Display'] mb-1 text-xl font-black",
      children: s.name ?? student?.name ?? "Anonymous Student"
    }), /* @__PURE__ */ jsx("div", {
      className: "mb-5 font-mono text-xs text-neutral-300",
      children: id
    }), /* @__PURE__ */ jsx("div", {
      className: "mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4",
      children: [{
        label: "Target Role",
        val: p.target_role
      }, {
        label: "Industry",
        val: p.target_industry
      }, {
        label: "Readiness",
        val: p.readiness_score ? `${p.readiness_score}%` : void 0,
        color: "text-violet-600"
      }, {
        label: "Reply Prob.",
        val: p.reply_probability ? `${p.reply_probability}%` : void 0,
        color: "text-emerald-600"
      }, {
        label: "Sessions",
        val: activity?.coach?.session_count ?? s.session_count ?? student?.session_count
      }].map(({
        label,
        val,
        color
      }) => /* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsx("div", {
          className: "text-xs text-neutral-400",
          children: label
        }), /* @__PURE__ */ jsx("div", {
          className: `text-sm font-semibold ${color ?? ""}`,
          children: val ?? "—"
        })]
      }, label))
    }), p.one_line_summary && /* @__PURE__ */ jsxs("div", {
      className: "mb-5 rounded-xl bg-violet-50 p-4",
      children: [/* @__PURE__ */ jsx("div", {
        className: "mb-1 text-xs font-bold uppercase tracking-widest text-violet-400",
        children: "DNA Summary"
      }), /* @__PURE__ */ jsx("div", {
        className: "text-sm italic text-violet-800 leading-relaxed",
        children: p.one_line_summary
      })]
    }), (p.skills_you_have ?? []).length > 0 && /* @__PURE__ */ jsxs("div", {
      className: "mb-5",
      children: [/* @__PURE__ */ jsx("div", {
        className: "mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400",
        children: "Skills"
      }), /* @__PURE__ */ jsx("div", {
        className: "flex flex-wrap gap-1.5 mb-3",
        children: (p.skills_you_have ?? []).map((sk) => /* @__PURE__ */ jsx("span", {
          className: "rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700",
          children: sk
        }, sk))
      }), (p.skills_to_build ?? []).length > 0 && /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsx("div", {
          className: "mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400",
          children: "To build"
        }), /* @__PURE__ */ jsx("div", {
          className: "flex flex-wrap gap-1.5",
          children: (p.skills_to_build ?? []).map((sk, i) => {
            const label = typeof sk === "object" && sk !== null ? sk.skill : String(sk);
            return /* @__PURE__ */ jsx("span", {
              className: "rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700",
              children: label
            }, i);
          })
        })]
      })]
    }), /* @__PURE__ */ jsx(ActivitySection, {
      activity,
      coachEmail: s.email ?? student?.email
    }), /* @__PURE__ */ jsxs("div", {
      className: "mb-5",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-2 flex items-center justify-between",
        children: [/* @__PURE__ */ jsx("div", {
          className: "text-xs font-bold uppercase tracking-widest text-neutral-400",
          children: "Chat Logs"
        }), showTranscripts ? /* @__PURE__ */ jsx("button", {
          onClick: onHideTranscripts,
          className: "text-xs font-semibold text-neutral-500 hover:text-neutral-900",
          children: "Hide"
        }) : /* @__PURE__ */ jsx("button", {
          onClick: onViewTranscripts,
          className: "rounded-full border-2 border-neutral-900 bg-white px-3 py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50",
          children: "View chat logs →"
        })]
      }), showTranscripts && (loadingTranscripts ? /* @__PURE__ */ jsx("div", {
        className: "rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-xs text-neutral-400",
        children: "Loading transcripts…"
      }) : transcripts && transcripts.length ? (() => {
        const ordered = [...transcripts].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
        const totalMsgs = ordered.reduce((n, c) => n + (c.message_count || 0), 0);
        return /* @__PURE__ */ jsxs("div", {
          className: "space-y-4",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "rounded-lg bg-neutral-50 px-3 py-2 text-[11px] font-semibold text-neutral-500",
            children: [ordered.length, " session", ordered.length === 1 ? "" : "s", " · ", totalMsgs, " messages total", ordered.length > 1 ? " — scroll through every conversation below, oldest first" : ""]
          }), ordered.map((conv, idx) => /* @__PURE__ */ jsxs("div", {
            className: "rounded-xl border border-neutral-200 bg-white",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "flex items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "min-w-0",
                children: [/* @__PURE__ */ jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [/* @__PURE__ */ jsxs("span", {
                    className: "shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700",
                    children: ["Session ", idx + 1]
                  }), /* @__PURE__ */ jsx("span", {
                    className: "truncate text-xs font-bold text-neutral-700",
                    children: conv.title
                  })]
                }), conv.created_at ? /* @__PURE__ */ jsxs("div", {
                  className: "mt-0.5 text-[10px] text-neutral-400",
                  children: [new Date(conv.created_at).toLocaleString("en-IN"), conv.thread_type && conv.thread_type !== "main" ? ` · ${conv.thread_type.replace(/_/g, " ")}` : ""]
                }) : null]
              }), /* @__PURE__ */ jsxs("span", {
                className: "shrink-0 text-[10px] text-neutral-400",
                children: [conv.message_count, " msgs", conv.last_state ? ` · ${conv.last_state}` : ""]
              })]
            }), /* @__PURE__ */ jsx("div", {
              className: "space-y-2 p-3",
              children: conv.messages.map((m, i) => /* @__PURE__ */ jsx("div", {
                className: `flex ${m.role === "user" ? "justify-end" : "justify-start"}`,
                children: /* @__PURE__ */ jsx("div", {
                  className: `max-w-[80%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed ${m.role === "user" ? "bg-violet-500 text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-800"}`,
                  title: m.at ? new Date(m.at).toLocaleString("en-IN") : void 0,
                  children: renderAdminMsg(m.content)
                })
              }, i))
            })]
          }, conv.conversation_id))]
        });
      })() : /* @__PURE__ */ jsx("p", {
        className: "text-xs text-neutral-400",
        children: "No chat logs for this student yet."
      }))]
    }), /* @__PURE__ */ jsxs("div", {
      className: "mb-5",
      children: [/* @__PURE__ */ jsx("div", {
        className: "mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400",
        children: "Admin Notes"
      }), /* @__PURE__ */ jsx("textarea", {
        rows: 3,
        value: noteVal,
        onChange: (e) => setNoteVal(e.target.value),
        placeholder: "Add notes about this student…",
        className: "w-full rounded-xl border border-neutral-200 p-3 font-['Satoshi'] text-sm outline-none focus:border-violet-400"
      }), /* @__PURE__ */ jsx("button", {
        onClick: () => onSaveNote(noteVal),
        className: "mt-2 rounded-full border-2 border-neutral-900 bg-gradient-to-r from-violet-500 to-pink-500 px-5 py-2 text-xs font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-all",
        children: "Save note"
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "text-xs text-neutral-400",
      children: ["Student ID: ", id]
    })]
  });
}
function eventLabel(type) {
  const map = {
    conversation_started: "Started a conversation",
    new_path_exploration_started: "Started exploring a new path",
    resume_uploaded: "Uploaded a resume",
    check_in_logged: "Logged a check-in",
    state_reached_profiling: "Reached: Profiling",
    state_reached_career_analysis: "Reached: Career Analysis",
    state_reached_dna_review: "Reached: Career DNA review",
    state_reached_roadmap: "Reached: Roadmap",
    state_reached_ongoing_support: "Reached: Ongoing support",
    tool_click_resume_maker: "Clicked → Resume Maker",
    tool_click_outreach_dojo: "Clicked → Outreach Dojo",
    tool_click_internship_dojo: "Clicked → Internship Dojo",
    tool_click_reports: "Clicked → Reports",
    tool_click_ai_risk: "Clicked → AI Risk Dojo",
    agent_error: "⚠ Agent hit a technical error",
    resume_upload_rejected: "Resume upload rejected",
    checkin_reminder_sent: "Check-in reminder emailed",
    streak_reward_unlocked: "Unlocked consistency reward"
  };
  if (map[type]) return map[type];
  if (type.startsWith("tool_click_")) return "Clicked → " + type.replace("tool_click_", "").replace(/_/g, " ");
  if (type.startsWith("state_reached_")) return "Reached: " + type.replace("state_reached_", "").replace(/_/g, " ");
  return type.replace(/_/g, " ");
}
function ActivitySection({
  activity,
  coachEmail
}) {
  if (!activity) {
    return /* @__PURE__ */ jsx("div", {
      className: "mb-5 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-xs text-neutral-400",
      children: "Loading activity log…"
    });
  }
  const mp = activity.main_platform;
  const linked = activity.main_platform_linked && mp?.found;
  const tools = mp?.tools;
  const events = activity.coach?.events ?? [];
  const ms = activity.coach?.milestones;
  return /* @__PURE__ */ jsxs("div", {
    className: "mb-5",
    children: [ms && /* @__PURE__ */ jsxs("div", {
      className: "mb-4",
      children: [/* @__PURE__ */ jsx("div", {
        className: "mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400",
        children: "Coach Progress"
      }), /* @__PURE__ */ jsx("div", {
        className: "space-y-1.5 rounded-xl border border-neutral-100 bg-neutral-50 p-3",
        children: [["Career Analysis generated", ms.career_analysis], ["Career Roadmap generated", ms.roadmap], ["Dashboard ready", ms.dashboard_ready]].map(([label, m]) => /* @__PURE__ */ jsxs("div", {
          className: "flex items-center justify-between text-sm",
          children: [/* @__PURE__ */ jsxs("span", {
            className: "flex items-center gap-2",
            children: [/* @__PURE__ */ jsx("span", {
              className: `flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${m?.done ? "bg-emerald-500 text-white" : "bg-neutral-200 text-neutral-400"}`,
              children: m?.done ? "✓" : "○"
            }), /* @__PURE__ */ jsx("span", {
              className: m?.done ? "font-semibold text-neutral-800" : "text-neutral-400",
              children: label
            })]
          }), m?.done && m?.at && /* @__PURE__ */ jsx("span", {
            className: "text-[11px] text-neutral-400",
            children: fmtDate(m.at)
          })]
        }, label))
      })]
    }), /* @__PURE__ */ jsx("div", {
      className: "mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400",
      children: "Activity & Sign-in Log"
    }), /* @__PURE__ */ jsxs("div", {
      className: "mb-3 rounded-xl border border-neutral-100 bg-neutral-50 p-4 space-y-2",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex justify-between text-sm",
        children: [/* @__PURE__ */ jsx("span", {
          className: "text-neutral-400",
          children: "Email"
        }), /* @__PURE__ */ jsx("span", {
          className: "font-semibold",
          children: mp?.user?.email ?? coachEmail ?? "—"
        })]
      }), activity.location && (activity.location.city || activity.location.country) && /* @__PURE__ */ jsxs("div", {
        className: "flex justify-between text-sm",
        children: [/* @__PURE__ */ jsx("span", {
          className: "text-neutral-400",
          children: "Location"
        }), /* @__PURE__ */ jsxs("span", {
          className: "font-semibold",
          title: "From most recent login IP",
          children: ["📍 ", [activity.location.city, activity.location.region, activity.location.country].filter(Boolean).join(", ")]
        })]
      }), linked ? /* @__PURE__ */ jsxs(Fragment, {
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex justify-between text-sm",
          children: [/* @__PURE__ */ jsx("span", {
            className: "text-neutral-400",
            children: "Signed up"
          }), /* @__PURE__ */ jsx("span", {
            className: "font-semibold",
            children: fmtDate(mp?.user?.created_at)
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex justify-between text-sm",
          children: [/* @__PURE__ */ jsx("span", {
            className: "text-neutral-400",
            children: "Sign-up method"
          }), /* @__PURE__ */ jsx("span", {
            className: "font-semibold",
            children: (mp?.signup_methods ?? []).map((m) => m.method).join(", ") || "—"
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex justify-between text-sm",
          children: [/* @__PURE__ */ jsx("span", {
            className: "text-neutral-400",
            children: "Last login method"
          }), /* @__PURE__ */ jsx("span", {
            className: "font-semibold",
            children: mp?.user?.last_login_method ?? "—"
          })]
        }), mp?.profile?.referral_source && /* @__PURE__ */ jsxs("div", {
          className: "flex justify-between text-sm",
          children: [/* @__PURE__ */ jsx("span", {
            className: "text-neutral-400",
            children: "Heard about us via"
          }), /* @__PURE__ */ jsx("span", {
            className: "font-semibold",
            children: mp.profile.referral_source
          })]
        })]
      }) : /* @__PURE__ */ jsx("div", {
        className: "text-xs text-neutral-400",
        children: "No main-platform (studojo.com) account linked to this email yet — the person used the coach without signing in on the main site, or signed in with a different email."
      })]
    }), linked && tools && /* @__PURE__ */ jsx("div", {
      className: "mb-3 grid grid-cols-3 gap-2",
      children: [{
        label: "Resume Maker",
        t: tools.resume_maker
      }, {
        label: "Internship apps",
        t: tools.internship_applications
      }, {
        label: "Career apps",
        t: tools.career_applications
      }].map(({
        label,
        t
      }) => /* @__PURE__ */ jsxs("div", {
        className: `rounded-xl border p-3 text-center ${t?.used ? "border-emerald-300 bg-emerald-50" : "border-neutral-100 bg-neutral-50"}`,
        children: [/* @__PURE__ */ jsx("div", {
          className: `text-lg font-black ${t?.used ? "text-emerald-700" : "text-neutral-300"}`,
          children: t?.count ?? 0
        }), /* @__PURE__ */ jsx("div", {
          className: "text-[10px] uppercase tracking-wide text-neutral-400",
          children: label
        })]
      }, label))
    }), linked && (mp?.logins ?? []).length > 0 && /* @__PURE__ */ jsxs("details", {
      className: "mb-3 rounded-xl border border-neutral-100 bg-white p-3",
      children: [/* @__PURE__ */ jsxs("summary", {
        className: "cursor-pointer text-xs font-bold text-neutral-500",
        children: ["Recent logins (", mp.logins.length, ")"]
      }), /* @__PURE__ */ jsx("div", {
        className: "mt-2 space-y-1",
        children: mp.logins.slice(0, 10).map((l, i) => /* @__PURE__ */ jsxs("div", {
          className: "flex justify-between gap-2 text-[11px] text-neutral-500",
          children: [/* @__PURE__ */ jsx("span", {
            children: fmtDateTime(l.at)
          }), /* @__PURE__ */ jsx("span", {
            className: "truncate text-right text-neutral-400",
            title: l.user_agent,
            children: l.ip ?? ""
          })]
        }, i))
      })]
    }), (() => {
      const errCount = (events || []).filter((e) => e.type === "agent_error").length;
      if (!errCount) return null;
      return /* @__PURE__ */ jsxs("div", {
        className: "mb-3 rounded-xl border-2 border-red-400 bg-red-50 p-3",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "text-xs font-bold text-red-700",
          children: ["⚠ Agent errored ", errCount, " time", errCount === 1 ? "" : "s", " for this student"]
        }), /* @__PURE__ */ jsxs("div", {
          className: "text-[11px] text-red-600 mt-0.5",
          children: ['The coach replied "Something went wrong on my end" on ', errCount, " turn", errCount === 1 ? "" : "s", " — see the timeline below."]
        })]
      });
    })(), /* @__PURE__ */ jsxs("div", {
      className: "rounded-xl border border-neutral-100 bg-white p-3",
      children: [/* @__PURE__ */ jsx("div", {
        className: "mb-2 text-xs font-bold text-neutral-500",
        children: "Career-coach activity"
      }), events.length ? /* @__PURE__ */ jsx("div", {
        className: "space-y-1.5",
        children: events.slice(-25).reverse().map((e, i) => {
          const isErr = e.type === "agent_error";
          return /* @__PURE__ */ jsxs("div", {
            className: `flex justify-between gap-2 text-[11px] ${isErr ? "rounded bg-red-50 px-1.5 py-1" : ""}`,
            children: [/* @__PURE__ */ jsx("span", {
              className: `font-medium ${isErr ? "text-red-700 font-bold" : "text-neutral-700"}`,
              children: eventLabel(e.type)
            }), /* @__PURE__ */ jsx("span", {
              className: "shrink-0 text-neutral-400",
              children: fmtDateTime(e.at)
            })]
          }, i);
        })
      }) : /* @__PURE__ */ jsx("p", {
        className: "text-[11px] text-neutral-400",
        children: "No tracked events yet."
      })]
    })]
  });
}
const route41 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: careerCoach,
  meta: meta$1
}, Symbol.toStringTag, { value: "Module" }));
function meta({}) {
  return [{
    title: "Webinar Signups – Admin Panel"
  }];
}
const NOT_SPECIFIED = "__none__";
const webinarRegistrations = UNSAFE_withComponentProps(function WebinarRegistrations() {
  const {
    isAuthorized,
    isPending
  } = useAdminGuard();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stageFilter, setStageFilter] = useState("");
  useEffect(() => {
    if (isPending || !isAuthorized) return;
    const fetchRows = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/webinar-registrations", {
          headers: {
            Authorization: `Bearer ${token}`
          },
          credentials: "include"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data.registrations || []);
        setStats(data.stats || null);
      } catch (e) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [isPending, isAuthorized]);
  const stages = useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    rows.forEach((r) => {
      if (r.life_stage) set.add(r.life_stage);
    });
    return Array.from(set).sort();
  }, [rows]);
  const filtered = useMemo(() => {
    if (!stageFilter) return rows;
    if (stageFilter === NOT_SPECIFIED) return rows.filter((r) => !r.life_stage);
    return rows.filter((r) => r.life_stage === stageFilter);
  }, [rows, stageFilter]);
  const countBy = (key) => Object.entries(rows.reduce((acc, r) => {
    const label = (key(r) || "").trim() || "Not specified";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const stageBreakdown = useMemo(() => countBy((r) => r.life_stage), [rows]);
  const yearBreakdown = useMemo(() => countBy((r) => r.year_of_study), [rows]);
  const gradYearBreakdown = useMemo(() => countBy((r) => r.graduation_year), [rows]);
  const fmt2 = (iso) => new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const dash = (v) => v ? v : /* @__PURE__ */ jsx("span", {
    className: "text-gray-300",
    children: "—"
  });
  if (isPending) return null;
  return /* @__PURE__ */ jsxs("div", {
    className: "min-h-screen bg-[#F5F5F0]",
    children: [/* @__PURE__ */ jsx(AdminHeader, {}), /* @__PURE__ */ jsxs("main", {
      className: "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "mb-6",
        children: [/* @__PURE__ */ jsx("h1", {
          className: "text-2xl font-bold text-gray-900",
          style: {
            fontFamily: "Clash Display, sans-serif"
          },
          children: "Webinar Signups"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-sm text-gray-500 mt-1",
          children: "Everyone who registered for the webinar at studojo.com/webinar."
        })]
      }), stats && /* @__PURE__ */ jsx("div", {
        className: "grid grid-cols-2 gap-4 mb-6",
        children: [{
          label: "Total students",
          value: stats.total
        }, {
          label: "Past 24 hours",
          value: stats.last_24_hours
        }].map((s) => /* @__PURE__ */ jsxs("div", {
          className: "bg-white rounded-2xl border border-gray-200 p-5 shadow-sm",
          children: [/* @__PURE__ */ jsx("p", {
            className: "text-xs font-medium text-gray-500 uppercase tracking-wide",
            children: s.label
          }), /* @__PURE__ */ jsx("p", {
            className: "text-3xl font-bold text-gray-900 mt-1",
            children: s.value
          })]
        }, s.label))
      }), error && /* @__PURE__ */ jsx("div", {
        className: "mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700",
        children: error
      }), !loading && rows.length > 0 && /* @__PURE__ */ jsxs("div", {
        className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6",
        children: [/* @__PURE__ */ jsx(BreakdownCard, {
          title: "Stage in life",
          items: stageBreakdown
        }), /* @__PURE__ */ jsx(BreakdownCard, {
          title: "Year of study",
          items: yearBreakdown
        }), /* @__PURE__ */ jsx(BreakdownCard, {
          title: "Graduation year",
          items: gradYearBreakdown
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "flex items-center gap-3 mb-4",
        children: [/* @__PURE__ */ jsx("label", {
          className: "text-sm font-medium text-gray-600",
          children: "Stage:"
        }), /* @__PURE__ */ jsxs("select", {
          value: stageFilter,
          onChange: (e) => setStageFilter(e.target.value),
          className: "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300",
          children: [/* @__PURE__ */ jsx("option", {
            value: "",
            children: "All stages"
          }), stages.map((s) => /* @__PURE__ */ jsx("option", {
            value: s,
            children: s
          }, s)), /* @__PURE__ */ jsx("option", {
            value: NOT_SPECIFIED,
            children: "Not specified"
          })]
        }), /* @__PURE__ */ jsxs("span", {
          className: "text-sm text-gray-400",
          children: [filtered.length, " shown"]
        })]
      }), loading ? /* @__PURE__ */ jsx("div", {
        className: "text-center py-16 text-gray-400 text-sm",
        children: "Loading…"
      }) : filtered.length === 0 ? /* @__PURE__ */ jsxs("div", {
        className: "bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm",
        children: ["No registrations", stageFilter ? " for this stage" : "", " yet."]
      }) : /* @__PURE__ */ jsx("div", {
        className: "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto",
        children: /* @__PURE__ */ jsxs("table", {
          className: "w-full text-sm whitespace-nowrap",
          children: [/* @__PURE__ */ jsx("thead", {
            className: "bg-gray-50 border-b border-gray-200",
            children: /* @__PURE__ */ jsx("tr", {
              children: ["#", "Date", "Name", "Email", "WhatsApp", "College", "Course", "Specialisation", "Year", "Grad Year", "Stage"].map((h) => /* @__PURE__ */ jsx("th", {
                className: "px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide",
                children: h
              }, h))
            })
          }), /* @__PURE__ */ jsx("tbody", {
            className: "divide-y divide-gray-100",
            children: filtered.map((r) => /* @__PURE__ */ jsxs("tr", {
              className: "hover:bg-gray-50",
              children: [/* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-400 font-mono text-xs",
                children: r.id
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-500 text-xs",
                children: fmt2(r.created_at)
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-900 font-medium",
                children: r.full_name
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: r.email
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: r.whatsapp
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: r.college
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: r.course
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: dash(r.specialisation)
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: r.year_of_study
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3 text-gray-800",
                children: dash(r.graduation_year)
              }), /* @__PURE__ */ jsx("td", {
                className: "px-4 py-3",
                children: r.life_stage ? /* @__PURE__ */ jsx("span", {
                  className: "inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200",
                  children: r.life_stage
                }) : /* @__PURE__ */ jsx("span", {
                  className: "text-gray-300",
                  children: "—"
                })
              })]
            }, r.id))
          })]
        })
      })]
    })]
  });
});
function BreakdownCard({
  title,
  items
}) {
  const max = items.reduce((m, [, n]) => Math.max(m, n), 0) || 1;
  return /* @__PURE__ */ jsxs("div", {
    className: "bg-white rounded-2xl border border-gray-200 p-5 shadow-sm",
    children: [/* @__PURE__ */ jsx("p", {
      className: "text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3",
      children: title
    }), items.length === 0 ? /* @__PURE__ */ jsx("p", {
      className: "text-sm text-gray-400",
      children: "No data."
    }) : /* @__PURE__ */ jsx("div", {
      className: "space-y-2.5",
      children: items.map(([label, count]) => /* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex items-center justify-between text-sm",
          children: [/* @__PURE__ */ jsx("span", {
            className: "text-gray-700",
            children: label
          }), /* @__PURE__ */ jsx("span", {
            className: "font-semibold text-gray-900",
            children: count
          })]
        }), /* @__PURE__ */ jsx("div", {
          className: "mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden",
          children: /* @__PURE__ */ jsx("div", {
            className: "h-full rounded-full bg-violet-500",
            style: {
              width: `${count / max * 100}%`
            }
          })
        })]
      }, label))
    })]
  });
}
const route42 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: webinarRegistrations,
  meta
}, Symbol.toStringTag, { value: "Module" }));
async function loader({
  request
}) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    });
  }
  const roleResult = await db.execute(sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`);
  const role = roleResult.rows[0]?.role;
  if (role !== "admin" && role !== "ops") {
    return Response.json({
      error: "Forbidden"
    }, {
      status: 403
    });
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS webinar_registrations (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      email TEXT NOT NULL,
      college TEXT NOT NULL,
      course TEXT NOT NULL,
      specialisation TEXT,
      year_of_study TEXT NOT NULL,
      graduation_year TEXT,
      life_stage TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "500"), 1e3);
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const [rows, statsResult] = await Promise.all([db.execute(sql`
      SELECT id, full_name, whatsapp, email, college, course,
             specialisation, year_of_study, graduation_year, life_stage, created_at
      FROM webinar_registrations
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `), db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24_hours
      FROM webinar_registrations
    `)]);
  return Response.json({
    registrations: rows.rows,
    stats: statsResult.rows[0],
    limit,
    offset
  });
}
const route43 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-uDiRgCXU.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/index-BqfPLHtT.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/root-Cv64jeC-.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/index-BqfPLHtT.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js"], "css": ["/assets/root-CKnc0xi1.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dashboard": { "id": "routes/dashboard", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/dashboard-BAmnZjBy.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/index-CYFn8AAm.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/stat-card-Chyn4610.js", "/assets/source-breakdown-F5i0U9Ox.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/login": { "id": "routes/login", "parentId": "root", "path": "login", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/login-D0-RW_aH.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/api-BaVKNcht.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/users": { "id": "routes/users", "parentId": "root", "path": "users", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/users-BNgWeEG0.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/search-input-jQh-Z9eJ.js", "/assets/proxy-B6pKBcas.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/funnel": { "id": "routes/funnel", "parentId": "root", "path": "funnel", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/funnel-Dwu-LhFp.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/api-BaVKNcht.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/source-breakdown-F5i0U9Ox.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/user-journeys": { "id": "routes/user-journeys", "parentId": "root", "path": "journeys", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/user-journeys-CzNwD9pB.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/api-BaVKNcht.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/daily-dashboard": { "id": "routes/daily-dashboard", "parentId": "root", "path": "daily", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/daily-dashboard-C6Nddlhq.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/api-BaVKNcht.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/source-breakdown-F5i0U9Ox.js", "/assets/index-CYFn8AAm.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.dashboard": { "id": "routes/api.dashboard", "parentId": "root", "path": "api/dashboard", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.dashboard-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.overview": { "id": "routes/api.overview", "parentId": "root", "path": "api/overview", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.overview-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.paid-emails": { "id": "routes/api.paid-emails", "parentId": "root", "path": "api/paid-emails", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.paid-emails-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/assignments": { "id": "routes/assignments", "parentId": "root", "path": "assignments", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/assignments-C_IIygKG.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/search-input-jQh-Z9eJ.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dissertations": { "id": "routes/dissertations", "parentId": "root", "path": "dissertations", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/dissertations-70MQ0_1s.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/outreach-orders": { "id": "routes/outreach-orders", "parentId": "root", "path": "outreach-orders", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/outreach-orders-3GpLaGdm.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/index-CYFn8AAm.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/stat-card-Chyn4610.js", "/assets/search-input-jQh-Z9eJ.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/campaign-health": { "id": "routes/campaign-health", "parentId": "root", "path": "campaign-health", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/campaign-health-CGKvFiUd.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/paid-users": { "id": "routes/paid-users", "parentId": "root", "path": "paid-users", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/paid-users-C6J0ezrN.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/stat-card-Chyn4610.js", "/assets/search-input-jQh-Z9eJ.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/outreach-campaign": { "id": "routes/outreach-campaign", "parentId": "root", "path": "outreach-campaign", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/outreach-campaign-CPOBGXvo.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/outreach": { "id": "routes/outreach", "parentId": "root", "path": "outreach", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/outreach-X1rrfvZe.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/index-CYFn8AAm.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/careers": { "id": "routes/careers", "parentId": "root", "path": "careers", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/careers-BnTYjp0t.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/settings": { "id": "routes/settings", "parentId": "root", "path": "settings", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/settings-BJgy_jpX.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.settings": { "id": "routes/api.settings", "parentId": "root", "path": "api/settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.settings-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/email-sequences": { "id": "routes/email-sequences", "parentId": "root", "path": "email-sequences", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/email-sequences-DGyy2ZTK.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/chat-logs": { "id": "routes/chat-logs", "parentId": "root", "path": "chat-logs", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/chat-logs-BSVcTPzN.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.chat-logs": { "id": "routes/api.chat-logs", "parentId": "root", "path": "api/chat-logs", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.chat-logs-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/ops-alerts": { "id": "routes/ops-alerts", "parentId": "root", "path": "ops-alerts", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/ops-alerts-M4JdB7Ar.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.ops-alerts": { "id": "routes/api.ops-alerts", "parentId": "root", "path": "api/ops-alerts", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.ops-alerts-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.ops-alerts.$id": { "id": "routes/api.ops-alerts.$id", "parentId": "root", "path": "api/ops-alerts/:id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.ops-alerts._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/tickets": { "id": "routes/tickets", "parentId": "root", "path": "tickets", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/tickets-qsCJtdds.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/tickets.$id": { "id": "routes/tickets.$id", "parentId": "root", "path": "tickets/:id", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/tickets._id-CaAKVYZg.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.tickets": { "id": "routes/api.tickets", "parentId": "root", "path": "api/tickets", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.tickets-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.tickets.$id": { "id": "routes/api.tickets.$id", "parentId": "root", "path": "api/tickets/:id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.tickets._id-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.tickets.$id.messages": { "id": "routes/api.tickets.$id.messages", "parentId": "root", "path": "api/tickets/:id/messages", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.tickets._id.messages-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/consultation-signups": { "id": "routes/consultation-signups", "parentId": "root", "path": "consultation-signups", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/consultation-signups-C49mTZTk.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.consultation-signups": { "id": "routes/api.consultation-signups", "parentId": "root", "path": "api/consultation-signups", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.consultation-signups-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/analytics": { "id": "routes/analytics", "parentId": "root", "path": "analytics", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/analytics-CgrVCp-y.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/api-BaVKNcht.js", "/assets/index-CYFn8AAm.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/utm-builder": { "id": "routes/utm-builder", "parentId": "root", "path": "utm-builder", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/utm-builder-C3u2NbC0.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.utm-campaigns": { "id": "routes/api.utm-campaigns", "parentId": "root", "path": "api/utm-campaigns", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.utm-campaigns-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/coupons": { "id": "routes/coupons", "parentId": "root", "path": "coupons", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/coupons-BE2qtCoY.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.coupons": { "id": "routes/api.coupons", "parentId": "root", "path": "api/coupons", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.coupons-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.posthog": { "id": "routes/api.posthog", "parentId": "root", "path": "api/posthog", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.posthog-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.analytics": { "id": "routes/api.analytics", "parentId": "root", "path": "api/analytics", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.analytics-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.outreach": { "id": "routes/api.outreach", "parentId": "root", "path": "api/outreach", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.outreach-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/career-coach": { "id": "routes/career-coach", "parentId": "root", "path": "career-coach", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/career-coach-CULho01p.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/index-BjR75gdh.js", "/assets/proxy-B6pKBcas.js", "/assets/api-BaVKNcht.js", "/assets/index-BqfPLHtT.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webinar-registrations": { "id": "routes/webinar-registrations", "parentId": "root", "path": "webinar-registrations", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webinar-registrations-C_9irXJV.js", "imports": ["/assets/chunk-EPOLDU6W-CmigDcej.js", "/assets/admin-header-DT8BQ-rH.js", "/assets/auth-guard-_urwsxLO.js", "/assets/api-BaVKNcht.js", "/assets/proxy-B6pKBcas.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.webinar-registrations": { "id": "routes/api.webinar-registrations", "parentId": "root", "path": "api/webinar-registrations", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/api.webinar-registrations-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-1210f55d.js", "version": "1210f55d", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_subResourceIntegrity": false, "unstable_trailingSlashAwareDataRequests": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/dashboard": {
    id: "routes/dashboard",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route1
  },
  "routes/login": {
    id: "routes/login",
    parentId: "root",
    path: "login",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/users": {
    id: "routes/users",
    parentId: "root",
    path: "users",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/funnel": {
    id: "routes/funnel",
    parentId: "root",
    path: "funnel",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/user-journeys": {
    id: "routes/user-journeys",
    parentId: "root",
    path: "journeys",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/daily-dashboard": {
    id: "routes/daily-dashboard",
    parentId: "root",
    path: "daily",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.dashboard": {
    id: "routes/api.dashboard",
    parentId: "root",
    path: "api/dashboard",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.overview": {
    id: "routes/api.overview",
    parentId: "root",
    path: "api/overview",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/api.paid-emails": {
    id: "routes/api.paid-emails",
    parentId: "root",
    path: "api/paid-emails",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/assignments": {
    id: "routes/assignments",
    parentId: "root",
    path: "assignments",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/dissertations": {
    id: "routes/dissertations",
    parentId: "root",
    path: "dissertations",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/outreach-orders": {
    id: "routes/outreach-orders",
    parentId: "root",
    path: "outreach-orders",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/campaign-health": {
    id: "routes/campaign-health",
    parentId: "root",
    path: "campaign-health",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/paid-users": {
    id: "routes/paid-users",
    parentId: "root",
    path: "paid-users",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/outreach-campaign": {
    id: "routes/outreach-campaign",
    parentId: "root",
    path: "outreach-campaign",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/outreach": {
    id: "routes/outreach",
    parentId: "root",
    path: "outreach",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/careers": {
    id: "routes/careers",
    parentId: "root",
    path: "careers",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/settings": {
    id: "routes/settings",
    parentId: "root",
    path: "settings",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/api.settings": {
    id: "routes/api.settings",
    parentId: "root",
    path: "api/settings",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/email-sequences": {
    id: "routes/email-sequences",
    parentId: "root",
    path: "email-sequences",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/chat-logs": {
    id: "routes/chat-logs",
    parentId: "root",
    path: "chat-logs",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/api.chat-logs": {
    id: "routes/api.chat-logs",
    parentId: "root",
    path: "api/chat-logs",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/ops-alerts": {
    id: "routes/ops-alerts",
    parentId: "root",
    path: "ops-alerts",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/api.ops-alerts": {
    id: "routes/api.ops-alerts",
    parentId: "root",
    path: "api/ops-alerts",
    index: void 0,
    caseSensitive: void 0,
    module: route24
  },
  "routes/api.ops-alerts.$id": {
    id: "routes/api.ops-alerts.$id",
    parentId: "root",
    path: "api/ops-alerts/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route25
  },
  "routes/tickets": {
    id: "routes/tickets",
    parentId: "root",
    path: "tickets",
    index: void 0,
    caseSensitive: void 0,
    module: route26
  },
  "routes/tickets.$id": {
    id: "routes/tickets.$id",
    parentId: "root",
    path: "tickets/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route27
  },
  "routes/api.tickets": {
    id: "routes/api.tickets",
    parentId: "root",
    path: "api/tickets",
    index: void 0,
    caseSensitive: void 0,
    module: route28
  },
  "routes/api.tickets.$id": {
    id: "routes/api.tickets.$id",
    parentId: "root",
    path: "api/tickets/:id",
    index: void 0,
    caseSensitive: void 0,
    module: route29
  },
  "routes/api.tickets.$id.messages": {
    id: "routes/api.tickets.$id.messages",
    parentId: "root",
    path: "api/tickets/:id/messages",
    index: void 0,
    caseSensitive: void 0,
    module: route30
  },
  "routes/consultation-signups": {
    id: "routes/consultation-signups",
    parentId: "root",
    path: "consultation-signups",
    index: void 0,
    caseSensitive: void 0,
    module: route31
  },
  "routes/api.consultation-signups": {
    id: "routes/api.consultation-signups",
    parentId: "root",
    path: "api/consultation-signups",
    index: void 0,
    caseSensitive: void 0,
    module: route32
  },
  "routes/analytics": {
    id: "routes/analytics",
    parentId: "root",
    path: "analytics",
    index: void 0,
    caseSensitive: void 0,
    module: route33
  },
  "routes/utm-builder": {
    id: "routes/utm-builder",
    parentId: "root",
    path: "utm-builder",
    index: void 0,
    caseSensitive: void 0,
    module: route34
  },
  "routes/api.utm-campaigns": {
    id: "routes/api.utm-campaigns",
    parentId: "root",
    path: "api/utm-campaigns",
    index: void 0,
    caseSensitive: void 0,
    module: route35
  },
  "routes/coupons": {
    id: "routes/coupons",
    parentId: "root",
    path: "coupons",
    index: void 0,
    caseSensitive: void 0,
    module: route36
  },
  "routes/api.coupons": {
    id: "routes/api.coupons",
    parentId: "root",
    path: "api/coupons",
    index: void 0,
    caseSensitive: void 0,
    module: route37
  },
  "routes/api.posthog": {
    id: "routes/api.posthog",
    parentId: "root",
    path: "api/posthog",
    index: void 0,
    caseSensitive: void 0,
    module: route38
  },
  "routes/api.analytics": {
    id: "routes/api.analytics",
    parentId: "root",
    path: "api/analytics",
    index: void 0,
    caseSensitive: void 0,
    module: route39
  },
  "routes/api.outreach": {
    id: "routes/api.outreach",
    parentId: "root",
    path: "api/outreach",
    index: void 0,
    caseSensitive: void 0,
    module: route40
  },
  "routes/career-coach": {
    id: "routes/career-coach",
    parentId: "root",
    path: "career-coach",
    index: void 0,
    caseSensitive: void 0,
    module: route41
  },
  "routes/webinar-registrations": {
    id: "routes/webinar-registrations",
    parentId: "root",
    path: "webinar-registrations",
    index: void 0,
    caseSensitive: void 0,
    module: route42
  },
  "routes/api.webinar-registrations": {
    id: "routes/api.webinar-registrations",
    parentId: "root",
    path: "api/webinar-registrations",
    index: void 0,
    caseSensitive: void 0,
    module: route43
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
