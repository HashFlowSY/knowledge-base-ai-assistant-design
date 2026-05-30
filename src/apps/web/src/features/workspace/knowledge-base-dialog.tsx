"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";

import { knowledgeCopy } from "../../copy/knowledge";
import { useUsers } from "../admin/user-hooks";
import {
  useCreateKnowledgeBase,
  useKnowledgeBase,
  useUpdateKnowledgeBase,
} from "../knowledge/knowledge-hooks";
import { Button } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import type { FormSubmitHandler } from "../ui/form-types";
import { Notice } from "../ui/notice";
import { MemberPicker } from "./member-picker";
import {
  toKnowledgeBaseErrorCopy,
  toMemberOption,
} from "./workspace-formatters";
import { WorkspaceTextField } from "./workspace-text-field";
import { WorkspaceTextareaField } from "./workspace-textarea-field";
import type { MemberOption } from "./workspace-types";

export function KnowledgeBaseDialog({
  knowledgeBaseId,
  mode,
  onClose,
  onNotice,
  onSelectKnowledgeBase,
}: {
  knowledgeBaseId: string | null;
  mode: "create" | "edit";
  onClose: () => void;
  onNotice: (notice: string) => void;
  onSelectKnowledgeBase: (knowledgeBaseId: string) => void;
}): ReactElement {
  const editDetailQuery = useKnowledgeBase(mode === "edit" ? knowledgeBaseId : null);
  const createKnowledgeBase = useCreateKnowledgeBase();
  const updateKnowledgeBase = useUpdateKnowledgeBase(knowledgeBaseId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<MemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(mode === "create");
  const memberQueryInput = useMemo(
    () => ({
      filter: "member" as const,
      page: 1,
      pageSize: 8,
      sort: "name" as const,
      ...(memberSearch.trim().length === 0
        ? {}
        : { search: memberSearch.trim() }),
    }),
    [memberSearch],
  );
  const memberQuery = useUsers({
    ...memberQueryInput,
  });

  useEffect(() => {
    if (mode !== "edit" || editDetailQuery.data === undefined || initialized) {
      return;
    }

    setName(editDetailQuery.data.name);
    setDescription(editDetailQuery.data.description ?? "");
    setSelectedMembers(editDetailQuery.data.members.map(toMemberOption));
    setInitialized(true);
  }, [editDetailQuery.data, initialized, mode]);

  const pending = createKnowledgeBase.isPending || updateKnowledgeBase.isPending;
  const formDisabled = pending || (mode === "edit" && !initialized);
  const visibleMembers = useMemo(() => {
    const knownMembers = new Map<string, MemberOption>();

    for (const member of selectedMembers) {
      knownMembers.set(member.id, member);
    }

    for (const member of editDetailQuery.data?.members ?? []) {
      knownMembers.set(member.id, toMemberOption(member));
    }

    for (const member of memberQuery.data?.items ?? []) {
      knownMembers.set(member.id, toMemberOption(member));
    }

    return Array.from(knownMembers.values()).sort((left, right) =>
      left.name.localeCompare(right.name, "zh-CN"),
    );
  }, [editDetailQuery.data?.members, memberQuery.data?.items, selectedMembers]);

  const handleSubmit: FormSubmitHandler = async (event) => {
    event.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError(knowledgeCopy.validation.nameRequired);
      return;
    }

    try {
      const payload = {
        description,
        memberIds: selectedMembers.map((member) => member.id),
        name,
      };

      if (mode === "create") {
        const created = await createKnowledgeBase.mutateAsync(payload);
        onNotice(knowledgeCopy.success.created);
        onSelectKnowledgeBase(created.id);
      } else {
        const updated = await updateKnowledgeBase.mutateAsync(payload);
        onNotice(knowledgeCopy.success.updated);
        onSelectKnowledgeBase(updated.id);
      }
      onClose();
    } catch (caught) {
      setError(toKnowledgeBaseErrorCopy(caught));
    }
  };

  return (
    <DialogFrame
      description={
        mode === "create"
          ? knowledgeCopy.createKnowledgeBaseDescription
          : knowledgeCopy.editKnowledgeBaseDescription
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      title={
        mode === "create"
          ? knowledgeCopy.createKnowledgeBase
          : knowledgeCopy.editKnowledgeBase
      }
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        {mode === "edit" && editDetailQuery.isError ? (
          <Notice tone="error">{knowledgeCopy.errors.knowledgeBaseDetail}</Notice>
        ) : null}
        {mode === "edit" && !initialized ? (
          <Notice>{knowledgeCopy.pending.knowledgeBaseDetail}</Notice>
        ) : null}
        <WorkspaceTextField
          disabled={formDisabled}
          id="knowledge-base-name"
          label={knowledgeCopy.labels.name}
          onChange={setName}
          value={name}
        />
        <WorkspaceTextareaField
          disabled={formDisabled}
          id="knowledge-base-description"
          label={knowledgeCopy.labels.description}
          onChange={setDescription}
          value={description}
        />
        <MemberPicker
          disabled={formDisabled}
          members={visibleMembers}
          pending={memberQuery.isLoading}
          search={memberSearch}
          searchError={memberQuery.isError ? knowledgeCopy.errors.memberList : null}
          selectedMemberIds={new Set(selectedMembers.map((member) => member.id))}
          setSearch={setMemberSearch}
          toggleMember={(member) => {
            setSelectedMembers((current) =>
              current.some((item) => item.id === member.id)
                ? current.filter((item) => item.id !== member.id)
                : [...current, member],
            );
          }}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={pending}
            disabledReason={knowledgeCopy.pending.savingKnowledgeBase}
            onClick={onClose}
          >
            {knowledgeCopy.cancel}
          </Button>
          <Button
            disabled={pending || (mode === "edit" && !initialized)}
            disabledReason={knowledgeCopy.pending.savingKnowledgeBase}
            type="submit"
            variant="primary"
          >
            {knowledgeCopy.save}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
