export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="atmosphere-notice rounded-lg px-3 py-2 text-sm leading-6">
      {children}
    </div>
  );
}
