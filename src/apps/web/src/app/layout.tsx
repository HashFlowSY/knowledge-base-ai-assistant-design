import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "../features/api/app-providers";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

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
