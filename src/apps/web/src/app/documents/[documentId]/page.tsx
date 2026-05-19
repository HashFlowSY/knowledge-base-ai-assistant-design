import type { ReactElement } from "react";

import { DocumentDetailPage } from "../../../features/documents/document-detail-page";
import { MockDataBoundary } from "../../../features/mock/mock-data-boundary";

export default async function Page({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<ReactElement> {
  const { documentId } = await params;
  return (
    <MockDataBoundary>
      <DocumentDetailPage documentId={documentId} />
    </MockDataBoundary>
  );
}
