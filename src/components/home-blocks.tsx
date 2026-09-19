"use client";

import { useEffect, type ReactNode } from "react";
import { HomeReadProvider } from "@/components/home-read";
import { HomePublicInner } from "@/components/home-public";
import type { HomeLayoutDoc } from "@/data/home-layout-core";

export { HomeSlot, BlockMedia } from "@/components/home-public";
export type { HomeLayoutDoc };

export function HomeCanvas({
  initialOrder,
  layout,
  children,
}: {
  initialOrder?: unknown;
  layout?: unknown;
  children: ReactNode;
}) {
  const initial = layout || initialOrder;

  useEffect(() => {
    if (/(?:\?|&)edit=1(?:&|$)/.test(location.search)) location.replace("/edit");
  }, []);

  return (
    <HomeReadProvider initial={initial}>
      <HomePublicInner>{children}</HomePublicInner>
    </HomeReadProvider>
  );
}
