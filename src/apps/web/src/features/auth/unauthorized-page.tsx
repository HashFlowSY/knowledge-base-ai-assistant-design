"use client";

import type { ReactElement } from "react";

import { authCopy } from "../../copy/auth";
import { commonCopy } from "../../copy/common";
import { ButtonLink } from "../ui/button";
import { Panel, PanelHeader } from "../ui/panel";
import { ProtectedPage } from "../shell/protected-page";

export function UnauthorizedPage(): ReactElement {
  return (
    <ProtectedPage>
      <Panel className="mx-auto max-w-2xl">
        <PanelHeader description={authCopy.unauthorizedDescription} title={authCopy.unauthorizedTitle} />
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <ButtonLink href="/workspace" variant="primary">
            {commonCopy.returnWorkspace}
          </ButtonLink>
          <ButtonLink href="/chat">{commonCopy.enterChat}</ButtonLink>
        </div>
      </Panel>
    </ProtectedPage>
  );
}
