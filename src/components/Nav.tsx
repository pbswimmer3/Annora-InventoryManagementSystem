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
    <nav className="no-print bg-gradient-to-r from-orange-600 via-pink-600 to-purple-600 sticky top-0 z-10 shadow-lg">
      <div className="max-w-2xl mx-auto px-2">
        <p className="text-center text-white/80 text-xs pt-2 tracking-widest uppercase">
          Annora Boutique
        </p>
        <div className="flex">
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 text-center py-3 pb-4 text-lg font-medium min-h-[56px] flex items-center justify-center gap-2 transition-all ${
                  active
                    ? "text-white border-b-3 border-white"
                    : "text-white/60 hover:text-white/90"
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
