"use client";

import { usePathname } from "next/navigation";
import { TransitionPathnameContext } from "@/context/TransitionPathnameContext";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <TransitionPathnameContext.Provider value={pathname}>
      <div className="h-full w-full flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </TransitionPathnameContext.Provider>
  );
}

