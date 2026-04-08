"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/jobs", label: "Jobs" },
  { href: "/wip", label: "WIP Report" },
  { href: "/history", label: "History" },
];

export default function Nav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <nav className="bg-[#151E33] border-b border-[#2e4a7a]">
      <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="text-white font-bold text-lg tracking-wide">
          Vance Corp
        </span>
        <div className="flex items-center gap-6">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium transition-colors ${
                isActive(href)
                  ? "text-[#C9A84C]"
                  : "text-white hover:text-[#C9A84C]"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
