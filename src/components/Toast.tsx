"use client";

import { useEffect, useState, useCallback } from "react";

export interface ToastProps {
  message: string;
  type?: "info" | "warning" | "success" | "error";
  duration?: number; // ms, default 5000
  onDismiss?: () => void;
}

/**
 * Slide-in toast notification.
 * Renders in the bottom-right corner. Auto-dismisses after `duration` ms.
 *
 * Usage:
 *   const [toast, setToast] = useState<ToastProps | null>(null);
 *   setToast({ message: "Groq limit reached. Switching to Together AI…", type: "warning" });
 *   // In JSX:
 *   {toast && <Toast {...toast} onDismiss={() => setToast(null)} />}
 */
export function Toast({ message, type = "info", duration = 5000, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Allow the slide-out to play before unmounting
    setTimeout(() => onDismiss?.(), 300);
  }, [onDismiss]);

  useEffect(() => {
    // Trigger slide-in on next frame
    const enterTimer = requestAnimationFrame(() => setVisible(true));
    const exitTimer  = setTimeout(dismiss, duration);
    return () => {
      cancelAnimationFrame(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [dismiss, duration]);

  const colourMap = {
    info:    { bg: "bg-slate-800",   border: "border-slate-600",   text: "text-slate-100",  icon: "ℹ" },
    warning: { bg: "bg-amber-900",   border: "border-amber-600",   text: "text-amber-100",  icon: "⚠" },
    success: { bg: "bg-emerald-900", border: "border-emerald-600", text: "text-emerald-100", icon: "✓" },
    error:   { bg: "bg-rose-900",    border: "border-rose-600",    text: "text-rose-100",   icon: "✕" },
  }[type];

  return (
    <div
      className={[
        "fixed bottom-6 right-6 z-50 flex items-start gap-3",
        "max-w-sm w-full p-4 rounded-lg border shadow-xl",
        "transition-all duration-300 ease-out",
        colourMap.bg,
        colourMap.border,
        colourMap.text,
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      ].join(" ")}
      role="alert"
    >
      {/* Icon */}
      <span className="text-sm font-mono font-bold shrink-0 mt-0.5 w-4 text-center">
        {colourMap.icon}
      </span>

      {/* Message */}
      <p className="flex-1 text-xs font-mono leading-snug">{message}</p>

      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className="shrink-0 text-xs font-mono opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}
