import Link from "next/link";
import type { ReactElement } from "react";

export default function NotFound(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <section className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-primary">知识库 AI 助手</p>
        <h1 className="mt-2 text-2xl font-semibold">页面不存在</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          该地址没有对应的功能页面，请返回工作台继续操作。
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-3xl border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          href="/workspace"
        >
          返回工作台
        </Link>
      </section>
    </main>
  );
}
