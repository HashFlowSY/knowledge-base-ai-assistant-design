"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ClipboardEvent, type ReactElement } from "react";

import type { Role } from "@kb/auth";
import type { UserSummary } from "@kb/users";

import { adminCopy } from "../../copy/admin";
import { ApiClientError } from "../api/client";
import { Button } from "../ui/button";
import { DialogFrame } from "../ui/dialog";
import type { FormSubmitHandler } from "../ui/form-types";
import { Notice } from "../ui/notice";
import { SelectField } from "../ui/select-field";
import { roleOptionsForUser, shouldLogoutAfterUserUpdate } from "./user-ui-helpers";
import { useCreateUser, useUpdateUser } from "./user-hooks";

export function UserDialog({
  currentUserId,
  onClose,
  onNotice,
  user,
}: {
  currentUserId: string | null;
  onClose: () => void;
  onNotice: (notice: string) => void;
  user: UserSummary | null;
}): ReactElement {
  const queryClient = useQueryClient();
  const router = useRouter();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser(user?.id ?? null);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "member");
  const [error, setError] = useState<string | null>(null);
  const isCreateMode = user === null;
  const roleOptions = roleOptionsForUser({
    currentUserId,
    targetUserId: user?.id,
  });
  const pending = createUser.isPending || updateUser.isPending;

  const handleSubmit: FormSubmitHandler = async (event) => {
    event.preventDefault();
    setError(null);

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

    try {
      if (isCreateMode) {
        await createUser.mutateAsync({
          email,
          name,
          password,
          role,
        });
        onNotice("用户已新增。");
      } else {
        await updateUser.mutateAsync({
          email,
          name,
          password,
          role,
        });
        if (
          shouldLogoutAfterUserUpdate({
            currentUserId,
            password,
            targetUserId: user.id,
          })
        ) {
          queryClient.clear();
          router.replace("/login");
          return;
        }
        onNotice("用户信息已更新。");
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.response.message : "操作失败，请稍后重试。");
    }
  };

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
            disabled={pending}
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
            disabled={pending}
            id="user-email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </div>
        <PasswordField
          disabled={pending}
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
            onChange={(value) => setRole(value as Role)}
            options={roleOptions}
            value={role}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={pending} disabledReason="正在保存用户。" onClick={onClose}>
            取消
          </Button>
          <Button disabled={pending} disabledReason="正在保存用户。" type="submit" variant="primary">
            保存
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function PasswordField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
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
          disabled={disabled}
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
          disabled={disabled}
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
