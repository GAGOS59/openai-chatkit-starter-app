"use client";
import { usePathname } from "next/navigation";
import React from "react";

export default function NavTabs() {
  const pathname = usePathname();

  // Pour l’onglet principal, on considère aussi "/" ou "" comme actif
  const isGuide = pathname === "/" || pathname === "";
  const isChatLibre = pathname.startsWith("/chat-libre");

  return (
    <nav className="flex gap-4 justify-center mt-4 mb-6">
      <a
        href="/"
        className={
          "px-4 py-2 rounded font-semibold transition " +
          (isGuide
            ? "bg-[#0f3d69] text-white shadow"
            : "text-[#0f3d69] hover:bg-blue-50 border border-transparent hover:border-[#0f3d69]")
        }
        aria-current={isGuide ? "page" : undefined}
      >
        Guide interactif EFT
      </a>
      <a
        href="/chat-libre"
        className={
          "px-4 py-2 rounded font-semibold transition " +
          (isChatLibre
            ? "bg-[#0f3d69] text-white shadow"
            : "text-[#0f3d69] hover:bg-blue-50 border border-transparent hover:border-[#0f3d69]")
        }
        aria-current={isChatLibre ? "page" : undefined}
      >
        Chat libre EFT officielle
      </a>
    </nav>
  );
}
