"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ServiceUnavailableDialogProps = {
  message: string;
  onClose: () => void;
  onRetry: () => void;
};

export function ServiceUnavailableDialog({
  message,
  onClose,
  onRetry,
}: ServiceUnavailableDialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] grid place-items-center bg-[#111111]/45 px-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-unavailable-title"
    >
      <div className="w-full max-w-md rounded-[1.6rem] border border-[#d7d0c4] bg-[#fffdf7] p-6 shadow-[0_28px_90px_rgba(17,17,17,0.28)]">
        <div className="text-xs uppercase tracking-[0.2em] text-[#8a4334]">Connection interrupted</div>
        <h2 id="service-unavailable-title" className="mt-2 text-2xl font-medium text-[#111111]">
          Benchmark service unavailable
        </h2>
        <p className="mt-3 text-sm leading-7 text-[#5d574d]">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onRetry}
            className="flex-1 rounded-full bg-[#111111] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#d7ff00] hover:text-[#111111]"
          >
            Retry attempt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#cfc7ba] px-4 py-3 text-sm font-medium text-[#4d483f] transition hover:border-[#111111]"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
