import type { ReactElement } from "react";

import { DocumentDetailPage } from "../../../features/documents/document-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ documentId: string }>;
}): Promise<ReactElement> {
  const { documentId } = await params;
  return <DocumentDetailPage documentId={documentId} />;
}
