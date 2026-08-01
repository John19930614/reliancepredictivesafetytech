"use client";

import { Home, Lightbulb, MessageCircle, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMobileTabForPath } from "@/lib/mobile-app";

const TAB_ICONS = {
  home: Home,
  chat: MessageCircle,
  ideas: Lightbulb,
  leads: Target,
} as const;

type MobileTabBarProps = {
  tabs: { key: string; label: string; href: string }[];
};

export function MobileTabBar({ tabs }: MobileTabBarProps) {
  const pathname = usePathname();
  const activeTab = getMobileTabForPath(pathname ?? "/m");

  return (
    <nav aria-label="Mobile app sections" className="m-tabbar">
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab.key as keyof typeof TAB_ICONS] ?? Home;
        const isActive = activeTab?.key === tab.key;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`m-tabbar-item${isActive ? " is-active" : ""}`}
            href={tab.href}
            key={tab.key}
          >
            <Icon aria-hidden="true" size={22} strokeWidth={isActive ? 2.4 : 1.8} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
