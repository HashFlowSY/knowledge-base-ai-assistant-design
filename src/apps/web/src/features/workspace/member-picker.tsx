import { Search } from "lucide-react";
import type { ReactElement } from "react";

import { knowledgeCopy } from "../../copy/knowledge";
import { Notice } from "../ui/notice";
import type { MemberOption } from "./workspace-types";

export function MemberPicker({
  disabled,
  members,
  pending,
  search,
  searchError,
  selectedMemberIds,
  setSearch,
  toggleMember,
}: {
  disabled: boolean;
  members: MemberOption[];
  pending: boolean;
  search: string;
  searchError: string | null;
  selectedMemberIds: Set<string>;
  setSearch: (value: string) => void;
  toggleMember: (member: MemberOption) => void;
}): ReactElement {
  return (
    <div className="space-y-3">
      <div>
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="knowledge-base-members"
        >
          {knowledgeCopy.members.searchLabel}
        </label>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {knowledgeCopy.members.description}
        </p>
        <div className="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
          <input
            className="min-w-0 flex-1 text-sm outline-none"
            disabled={disabled}
            id="knowledge-base-members"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={knowledgeCopy.members.searchPlaceholder}
            value={search}
          />
        </div>
      </div>
      {pending ? <Notice>{knowledgeCopy.pending.memberList}</Notice> : null}
      {searchError === null ? null : <Notice tone="error">{searchError}</Notice>}
      <div className="space-y-2 rounded-md border border-slate-200 p-3">
        <p className="text-xs font-medium text-slate-500">
          {knowledgeCopy.members.selectionLabel}
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-slate-600">{knowledgeCopy.members.empty}</p>
        ) : (
          members.map((member) => {
            const checked = selectedMemberIds.has(member.id);

            return (
              <label
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                htmlFor={`member-${member.id}`}
                key={member.id}
              >
                <input
                  checked={checked}
                  className="mt-1 h-4 w-4"
                  disabled={disabled}
                  id={`member-${member.id}`}
                  onChange={() => toggleMember(member)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-950">
                    {member.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {member.email}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
