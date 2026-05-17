"use client";

import { useState, type FormEvent, type ReactElement } from "react";

import { adminCopy } from "../../copy/admin";
import { useMockStore } from "../mock/store";
import type { MockRole, MockUser, MockUserStatus } from "../mock/types";
import { Button } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import { Notice } from "../ui/notice";
import { SelectField, type SelectFieldOption } from "../ui/select-field";

export function UserDialog({
  onClose,
  onNotice,
  user,
}: {
  onClose: () => void;
  onNotice: (notice: string) => void;
  user: MockUser | null;
}): ReactElement {
  const { dispatch } = useMockStore();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<MockRole>(user?.role ?? "member");
  const [status, setStatus] = useState<MockUserStatus>(user?.status ?? "active");
  const [error, setError] = useState<string | null>(null);
  const isCreateMode = user === null;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError(adminCopy.validation.nameRequired);
      return;
    }
    if (!email.includes("@")) {
      setError(adminCopy.validation.emailRequired);
      return;
    }

    if (isCreateMode) {
      dispatch({ email: email.trim(), name: name.trim(), role, status, type: "createUser" });
      onNotice("用户已新增。");
    } else if (user !== null) {
      dispatch({
        email: email.trim(),
        name: name.trim(),
        role,
        status,
        type: "updateUser",
        userId: user.id,
      });
      onNotice("用户信息已更新。");
    }
    onClose();
  }

  return (
    <DialogFrame
      description={isCreateMode ? adminCopy.createUserDescription : adminCopy.editUserDescription}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={isCreateMode ? adminCopy.createUser : adminCopy.editUser}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-name">
            姓名
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            id="user-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-email">
            邮箱
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            id="user-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-role">
            角色
          </label>
          <SelectField
            ariaLabel="角色"
            className="mt-2"
            onChange={(value) => setRole(value as MockRole)}
            options={toSelectOptions([["member", "member"], ["admin", "admin"]])}
            value={role}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="user-status">
            状态
          </label>
          <SelectField
            ariaLabel="用户状态"
            className="mt-2"
            onChange={(value) => setStatus(value as MockUserStatus)}
            options={toSelectOptions([["active", "启用"], ["disabled", "停用"], ["pending", "待确认"]])}
            value={status}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">
            保存
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}
