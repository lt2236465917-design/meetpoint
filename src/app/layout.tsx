import type { Metadata } from "next";
import { FunctionalScenicBackdrop } from "@/components/layout/FunctionalScenicBackdrop";
import "./globals.css";

export const metadata: Metadata = {
  title: "跨城见面计划：先算好在哪座城见",
  description:
    "每个人填一座出发城市，我们查遍真实机票和火车票，为朋友选出一座见面城市。",
  formatDetection: {
    telephone: false,
    date: false,
    email: false,
    address: false,
  },
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased notranslate" translate="no">
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <FunctionalScenicBackdrop />
        {children}
      </body>
    </html>
  );
}
