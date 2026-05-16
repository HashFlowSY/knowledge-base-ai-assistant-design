import type { ReactElement } from "react";

import { AdminListPage } from "../../features/admin/admin-list-page";

export default function Page(): ReactElement {
  return <AdminListPage kind="audit" />;
}
