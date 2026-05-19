import type { ReactElement } from "react";

import { AdminListPage } from "../../features/admin/admin-list-page";
import { MockDataBoundary } from "../../features/mock/mock-data-boundary";

export default function Page(): ReactElement {
  return (
    <MockDataBoundary>
      <AdminListPage kind="tasks" />
    </MockDataBoundary>
  );
}
