"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/add-stock", label: "Add Stock" },
  { href: "/checkout", label: "Checkout" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="no-print bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 text-center py-4 text-lg font-medium min-h-[56px] flex items-center justify-center transition-colors ${
                active
                  ? "text-indigo-600 border-b-2 border-indigo-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
