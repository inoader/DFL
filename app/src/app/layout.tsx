import "./globals.css";
import type { Metadata } from "next";
import { type ReactNode } from "react";
import { AppProviders } from "../components/providers";

export const metadata: Metadata = {
  title: "DFL - Solana 借贷协议",
  description: "基于 Solana 的超额抵押隔离借贷原型系统",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-stone-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
