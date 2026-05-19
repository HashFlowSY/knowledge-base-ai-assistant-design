import type { ReactElement } from "react";

import { ChatPage } from "../../features/chat/chat-page";
import { MockDataBoundary } from "../../features/mock/mock-data-boundary";

export default function Page(): ReactElement {
  return (
    <MockDataBoundary>
      <ChatPage />
    </MockDataBoundary>
  );
}
