"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { authCopy } from "../../copy/auth";
import { commonCopy } from "../../copy/common";
import { ApiClientError } from "../api/client";
import { Button } from "@/components/ui/button";
import type { FormSubmitHandler } from "@/lib/form-types";
import { Notice } from "@/components/ui/alert";
import { useLoginMutation, useSessionQuery } from "./auth-hooks";
import { getLoginRedirectTarget, sanitizeRedirectTo } from "./login-redirect";

export function LoginPage(): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionQuery = useSessionQuery();
  const loginMutation = useLoginMutation();
  const redirectTo = sanitizeRedirectTo(searchParams.get("redirectTo"));
  const sessionExpired = searchParams.get("sessionExpired") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = loginMutation.isPending;
  const loginRedirectTarget = getLoginRedirectTarget({
    isLoading: sessionQuery.isLoading,
    redirectTo,
    session: sessionQuery.data,
  });

  useEffect(() => {
    if (loginRedirectTarget !== null) {
      router.replace(loginRedirectTarget);
    }
  }, [loginRedirectTarget, router]);

  const handleSubmit: FormSubmitHandler = async (event) => {
    event.preventDefault();
    setError(null);

    try {
      await loginMutation.mutateAsync({ email, password });
      router.push(redirectTo);
    } catch (caught) {
      const message = caught instanceof ApiClientError ? caught.response.message : authCopy.invalid;
      setError(message);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div>
          <p className="text-sm font-medium text-primary">{commonCopy.productName}</p>
          <h1 className="mt-2 text-2xl font-semibold">{authCopy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{authCopy.description}</p>
        </div>

        <div className="mt-5 space-y-3">
          {sessionExpired ? <Notice>{authCopy.sessionExpired}</Notice> : null}
          {error === null ? null : <Notice tone="error">{error}</Notice>}
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="email">
              {authCopy.emailLabel}
            </label>
            <input
              className="mt-2 h-11 w-full rounded-3xl border border-border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={pending}
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground" htmlFor="password">
              {authCopy.passwordLabel}
            </label>
            <input
              className="mt-2 h-11 w-full rounded-3xl border border-border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              disabled={pending}
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </div>
          <Button className="w-full" disabled={pending} disabledReason="正在验证登录信息。" type="submit" variant="primary">
            <LogIn aria-hidden="true" className="h-4 w-4" />
            {pending ? "登录中" : authCopy.submit}
          </Button>
        </form>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button disabled disabledReason={authCopy.ssoDisabled} variant="secondary">
            SSO 登录
          </Button>
          <Button disabled disabledReason={authCopy.recoveryDisabled} variant="secondary">
            找回密码
          </Button>
        </div>
      </section>
    </main>
  );
}
