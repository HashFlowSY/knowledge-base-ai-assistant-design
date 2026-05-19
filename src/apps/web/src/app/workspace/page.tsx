import type { ReactElement } from "react";

import { MockDataBoundary } from "../../features/mock/mock-data-boundary";
import { WorkspaceMvpPage } from "../../features/workspace/workspace-mvp-page";

export default function Page(): ReactElement {
  return (
    <MockDataBoundary>
      <WorkspaceMvpPage />
    </MockDataBoundary>
  );
}
