import type { ReactNode } from "react";
import Link from "next/link";
import { ShellScenicBackdrop } from "@/components/layout/ShellScenicBackdrop";

export function ResponsiveShell({
  title,
  description,
  children,
  aside,
  actions,
  backHref,
  backLabel = "返回上一页",
  scenic = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  scenic?: boolean;
}) {
  return (
    <main className="atmosphere-shell atmosphere-canvas relative min-h-svh overflow-hidden">
      {scenic ? <ShellScenicBackdrop /> : null}
      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-2xl flex-col">
        <header className="shrink-0 border-b border-white/10 px-5 pb-4 pt-5 sm:px-8">
          {backHref && (
            <Link
              aria-label={backLabel}
              className="atmosphere-ghost mb-3 inline-flex h-9 items-center gap-1 rounded-full px-3 font-sans-sc text-sm font-medium"
              href={backHref}
            >
              <span aria-hidden="true">‹</span>
              <span>{backLabel}</span>
            </Link>
          )}
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--atmosphere-ink)]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 font-sans-sc text-sm leading-6 text-[var(--atmosphere-muted)]">
              {description}
            </p>
          )}
          {actions && <div className="mt-4">{actions}</div>}
        </header>

        <section className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-5 font-sans-sc sm:px-8">
          {children}
        </section>

        {aside && (
          <footer className="shrink-0 border-t border-white/10 px-5 py-4 text-[var(--atmosphere-muted)] sm:px-8">
            {aside}
          </footer>
        )}
      </div>
    </main>
  );
}
