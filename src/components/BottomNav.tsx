"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Home, Target, TreePine, Trophy, User } from "lucide-react";

const TABS = [
  { href: "/home", icon: Home, label: "Home" },
  { href: "/missions", icon: Target, label: "Mission" },
  { href: "/tree", icon: TreePine, label: "Tree" },
  { href: "/ranking", icon: Trophy, label: "Rank" },
  { href: "/profile", icon: User, label: "Me" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-black/5 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] shadow-soft">
      <ul className="flex justify-around">
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = pathname?.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={clsx(
                  "flex flex-col items-center gap-0.5 py-2 text-xs font-medium min-h-[44px] justify-center transition-colors",
                  active ? "text-us" : "text-gray-400"
                )}
              >
                <span className={clsx("rounded-pill px-3 py-0.5", active && "bg-pastel-green")}>
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
