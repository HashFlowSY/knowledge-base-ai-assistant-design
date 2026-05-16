import type { ReactElement, ReactNode } from "react";

import { Button } from "./button";
import { shouldShowDrawerCloseButton } from "./drawer-rules";
import { drawerBodyClassName, drawerClassName, drawerHeaderClassName } from "./drawer-styles";

export function Drawer({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}): ReactElement {
  return (
    <aside
      aria-label={title}
      className={drawerClassName()}
    >
      <div className={drawerHeaderClassName()}>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {shouldShowDrawerCloseButton() ? (
          <Button aria-label="关闭详情" onClick={onClose} variant="ghost">
            关闭
          </Button>
        ) : null}
      </div>
      <div className={drawerBodyClassName()}>{children}</div>
    </aside>
  );
}
