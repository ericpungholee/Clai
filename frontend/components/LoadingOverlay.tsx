"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isVisible: boolean;
  isExiting?: boolean; // If true, slides up. If false, slides down (enter) or stays (if visible).
}

export default function LoadingOverlay({ isVisible, isExiting = false }: LoadingOverlayProps) {
  if (!isVisible && !isExiting) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background
        transition-transform duration-500 ease-out
        ${!isVisible && !isExiting ? "hidden" : ""}
        ${isExiting 
          ? "-translate-y-full" 
          : "translate-y-0"
        }
      `}
    >
      <div className="flex items-center justify-center w-full h-full">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
      </div>
    </div>
  );
}

