"use client";

import { useEffect } from "react";

export function RecoveryHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;

    if (!hash.includes("access_token=") || !hash.includes("type=recovery")) {
      return;
    }

    window.location.replace(`/auth/update-password${hash}`);
  }, []);

  return null;
}
