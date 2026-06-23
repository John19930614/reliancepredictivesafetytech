import type { ReactNode } from "react";
import { LegalRegisterTabs } from "@/components/legal-register/LegalRegisterTabs";
import { LegalDisclaimer } from "@/components/legal-register/LegalDisclaimer";

export default function LegalRegisterLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <LegalRegisterTabs />
      {children}
      <LegalDisclaimer />
    </div>
  );
}
