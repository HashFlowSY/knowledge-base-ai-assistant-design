import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AppProviders } from "../features/api/app-providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "知识库 AI 助手",
  description: "企业级知识库 AI 助手功能 MVP",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="zh-CN" className={cn("font-sans", inter.variable)}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
