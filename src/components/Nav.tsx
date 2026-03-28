"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/add-stock", label: "Add Stock", icon: "+" },
  { href: "/checkout", label: "Checkout", icon: "\u2713" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="no-print bg-black sticky top-0 z-10 shadow-lg border-b border-amber-700/40">
      <div className="max-w-2xl mx-auto px-2">
        <div className="flex items-center justify-center pt-2 pb-1">
          <img src="/annora-logo.jpg" alt="Annora" className="h-28 rounded" />
        </div>
        <div className="flex">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 text-center py-3 pb-4 text-lg font-medium min-h-[56px] flex items-center justify-center gap-2 transition-all ${
                  active
                    ? "text-amber-400 border-b-3 border-amber-400"
                    : "text-gray-400 hover:text-amber-300"
                }`}
              >
                <span className={`text-xl ${active ? "scale-110" : ""} transition-transform`}>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
