"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ClipboardEvent, type FormEvent, type ReactElement } from "react";

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
  const [password, setPassword] = useState("");
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
    if (isCreateMode && password.trim().length === 0) {
      setError(adminCopy.validation.passwordRequired);
      return;
    }

    if (isCreateMode) {
      dispatch({ email: email.trim(), name: name.trim(), password, role, status, type: "createUser" });
      onNotice("用户已新增。");
    } else if (user !== null) {
      dispatch({
        email: email.trim(),
        name: name.trim(),
        password,
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
        <PasswordField
          label={isCreateMode ? "密码" : "密码（留空不修改）"}
          onChange={setPassword}
          value={password}
        />
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

function PasswordField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}): ReactElement {
  const [showPassword, setShowPassword] = useState(false);
  const id = "user-password";

  function hidePassword(): void {
    setShowPassword(false);
  }

  function handleCopy(event: ClipboardEvent<HTMLInputElement>): void {
    event.preventDefault();
    event.clipboardData.setData("text/plain", "");
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-2">
        <input
          className="h-11 w-full rounded-md border border-slate-200 px-3 pr-12 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          id={id}
          onBlur={hidePassword}
          onChange={(event) => onChange(event.target.value)}
          onCopy={handleCopy}
          type={showPassword ? "text" : "password"}
          value={value}
        />
        <button
          aria-label="显示密码"
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-100"
          onBlur={hidePassword}
          onContextMenu={(event) => event.preventDefault()}
          onPointerCancel={hidePassword}
          onPointerDown={(event) => {
            event.preventDefault();
            setShowPassword(true);
          }}
          onPointerLeave={hidePassword}
          onPointerUp={hidePassword}
          title="按住显示密码"
          type="button"
        >
          {showPassword ? (
            <EyeOff aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Eye aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function toSelectOptions(options: [string, string][]): SelectFieldOption[] {
  return options.map(([value, label]) => ({ label, value }));
}
