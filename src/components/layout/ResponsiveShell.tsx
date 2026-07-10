import type { ReactNode } from "react";
import Link from "next/link";

export function ResponsiveShell({
  title,
  description,
  children,
  aside,
  actions,
  backHref,
  backLabel = "返回上一页",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-100 p-0 text-gray-950 sm:p-6">
      <div className="flex h-svh w-full max-w-md flex-col overflow-hidden bg-white shadow-sm sm:h-[min(860px,calc(100svh-3rem))] sm:rounded-3xl sm:border sm:border-gray-200">
        <header className="shrink-0 border-b border-gray-100 px-5 pb-4 pt-5">
          {backHref && (
            <Link
              aria-label={backLabel}
              className="mb-3 inline-flex h-9 items-center gap-1 rounded-full border border-gray-200 px-3 text-sm font-medium text-gray-700"
              href={backHref}
            >
              <span aria-hidden="true">‹</span>
              <span>{backLabel}</span>
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {description}
            </p>
          )}
          {actions && <div className="mt-4">{actions}</div>}
        </header>

        <section className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </section>

        {aside && (
          <footer className="shrink-0 border-t border-gray-100 bg-white px-5 py-4">
            {aside}
          </footer>
        )}
      </div>
    </main>
  );
}
