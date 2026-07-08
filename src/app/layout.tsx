import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cross-City MeetPoint",
  description: "Mobile-first H5 app for cross-city meeting planning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
