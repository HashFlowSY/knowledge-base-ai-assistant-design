import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MockStoreProvider } from "../features/mock/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "知识库 AI 助手",
  description: "企业级知识库 AI 助手功能 MVP",
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="zh-CN">
      <body>
        <MockStoreProvider>{children}</MockStoreProvider>
      </body>
    </html>
  );
}
