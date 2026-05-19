import type { ReactElement } from "react";

import { DocumentsPage } from "../../features/documents/documents-page";
import { MockDataBoundary } from "../../features/mock/mock-data-boundary";

export default function Page(): ReactElement {
  return (
    <MockDataBoundary>
      <DocumentsPage />
    </MockDataBoundary>
  );
}
