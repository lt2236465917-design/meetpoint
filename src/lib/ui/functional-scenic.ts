import type { ScenicSceneId } from "@/lib/ui/scenic-videos";

export function functionalScenicScene(pathname: string): ScenicSceneId | null {
  if (pathname === "/create") return "stillWater";
  if (pathname === "/records") return "dawn";

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "p" || !segments[1]) return null;

  switch (segments[2]) {
    case "join":
    case "alternatives":
      return "stillWater";
    case "result":
      return "dawn";
    case "manage":
    case undefined:
      return "forest";
    default:
      return null;
  }
}
