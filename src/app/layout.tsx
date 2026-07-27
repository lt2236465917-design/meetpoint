import type { Metadata } from "next";
import { FunctionalScenicBackdrop } from "@/components/layout/FunctionalScenicBackdrop";
import { ScenicVideoDiagnostics } from "@/components/layout/ScenicVideoDiagnostics";
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
    // Keep scenic clips in-page on TBS / some Android OEM browsers (e.g. Mi Browser).
    "x5-video-player-type": "h5",
    "x5-video-player-fullscreen": "false",
    "x5-playsinline": "true",
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
        <ScenicVideoDiagnostics />
      </body>
    </html>
  );
}
