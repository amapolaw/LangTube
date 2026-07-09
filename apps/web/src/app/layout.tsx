import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NavBar } from "@/components/layout/nav-bar";

export const metadata: Metadata = {
  title: "LangTube — 多语言学习平台",
  description: "听·说·读·写·Notebook 个人多语言学习交互平台",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LangTube",
  },
};

export const viewport: Viewport = {
  themeColor: "#3b82f6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen font-sans antialiased">
        <NavBar />
        <main className="container mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
