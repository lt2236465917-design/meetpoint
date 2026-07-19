"use client";

import { usePathname } from "next/navigation";
import { ShellScenicBackdrop } from "@/components/layout/ShellScenicBackdrop";
import { functionalScenicScene } from "@/lib/ui/functional-scenic";

export function FunctionalScenicBackdrop() {
  const scene = functionalScenicScene(usePathname());
  return scene ? <ShellScenicBackdrop scene={scene} /> : null;
}
