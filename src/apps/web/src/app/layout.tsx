import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "../features/api/app-providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "知识库 AI 助手",
  description: "企业级知识库 AI 助手功能 MVP",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
