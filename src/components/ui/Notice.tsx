export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-600">
      {children}
    </div>
  );
}
