"use client";

import type { ReactElement, ReactNode } from "react";

import { MockStoreProvider } from "./store";

export function MockDataBoundary({ children }: { children: ReactNode }): ReactElement {
  return <MockStoreProvider>{children}</MockStoreProvider>;
}
