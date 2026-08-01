"use client";

import { PlusSquare, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "safetyiq-install-dismissed";

/**
 * iOS gives no programmatic install API — Add to Home Screen is a manual Safari
 * gesture — so the only thing that actually helps is showing the steps to
 * people who have not done it yet. Hidden once the app is already installed
 * (standalone display mode) or once the employee dismisses it.
 */
export function MobileInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari's own non-standard flag, still the reliable signal on iOS.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      return;
    }

    let dismissed = false;

    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private browsing can throw on localStorage; treat it as not dismissed.
    }

    setIsVisible(!dismissed);
  }, []);

  function dismiss() {
    setIsVisible(false);

    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nothing to persist to — the banner simply reappears next visit.
    }
  }

  if (!isVisible) {
    return null;
  }

  return (
    <aside className="m-install">
      <button aria-label="Dismiss install tip" className="m-install-close" onClick={dismiss} type="button">
        <X aria-hidden="true" size={15} strokeWidth={2.3} />
      </button>

      <div className="m-install-head">
        <span className="m-install-icon">
          <Smartphone aria-hidden="true" size={17} strokeWidth={2.1} />
        </span>
        <div>
          <strong>Add to your Home Screen</strong>
          <small>Get a real app icon and a full-screen view.</small>
        </div>
      </div>

      <ol className="m-install-steps">
        <li>
          <Share aria-hidden="true" size={14} strokeWidth={2.2} />
          Tap <b>Share</b> in Safari
        </li>
        <li>
          <PlusSquare aria-hidden="true" size={14} strokeWidth={2.2} />
          Choose <b>Add to Home Screen</b>
        </li>
      </ol>
    </aside>
  );
}
