import type { ReactNode } from "react";

export function PeakScenicAccent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`peak-scenic ${className}`.trim()}>
      {children}
    </div>
  );
}
