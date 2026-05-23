import { describe, expect, it } from "vitest";

import { apiClient } from "../api/client";
import {
  infiniteKnowledgeBasesQueryKey,
  knowledgeBaseQueryKey,
  knowledgeBasesQueryKey,
} from "./knowledge-hooks";

describe("knowledge hooks", () => {
  it("builds stable query keys from list and detail inputs", () => {
    expect(
      knowledgeBasesQueryKey({
        page: 2,
        pageSize: 8,
        search: "合同",
        sort: "name",
      }),
    ).toEqual(["knowledge-bases", { page: 2, pageSize: 8, search: "合同", sort: "name" }]);
    expect(
      infiniteKnowledgeBasesQueryKey({
        pageSize: 8,
        search: "合同",
        sort: "updated",
      }),
    ).toEqual(["knowledge-bases", "infinite", { pageSize: 8, search: "合同", sort: "updated" }]);
    expect(knowledgeBaseQueryKey("kb_1")).toEqual(["knowledge-bases", "kb_1"]);
    expect(knowledgeBaseQueryKey(null)).toEqual(["knowledge-bases", null]);
  });

  it("exposes the typed knowledge-base RPC routes on the browser API client", () => {
    expect(apiClient.api["knowledge-bases"].$get).toBeTypeOf("function");
    expect(apiClient.api["knowledge-bases"].$post).toBeTypeOf("function");
    expect(apiClient.api["knowledge-bases"][":knowledgeBaseId"].$get).toBeTypeOf("function");
    expect(apiClient.api["knowledge-bases"][":knowledgeBaseId"].$patch).toBeTypeOf("function");
  });
});
