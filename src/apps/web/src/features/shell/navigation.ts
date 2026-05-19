import {
  Activity,
  BookOpen,
  FileText,
  KeyRound,
  ListChecks,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@kb/auth";

export interface NavigationItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  adminOnly: boolean;
}

export const navigationItems: NavigationItem[] = [
  {
    href: "/workspace",
    label: "知识库",
    description: "管理文档与导入来源",
    icon: BookOpen,
    adminOnly: false,
  },
  {
    href: "/documents",
    label: "文档",
    description: "查看来源与片段",
    icon: FileText,
    adminOnly: false,
  },
  {
    href: "/chat",
    label: "问答",
    description: "基于授权知识库提问",
    icon: MessageSquareText,
    adminOnly: false,
  },
  {
    href: "/tasks",
    label: "任务",
    description: "查看导入与处理队列",
    icon: Activity,
    adminOnly: false,
  },
  {
    href: "/logs",
    label: "处理日志",
    description: "排查文档处理事件",
    icon: ListChecks,
    adminOnly: true,
  },
  {
    href: "/providers",
    label: "模型服务",
    description: "配置 Provider 与密钥",
    icon: KeyRound,
    adminOnly: true,
  },
  {
    href: "/users",
    label: "用户",
    description: "管理成员与固定角色",
    icon: UsersRound,
    adminOnly: true,
  },
  {
    href: "/audit",
    label: "审计日志",
    description: "查看管理与系统动作",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

export function visibleNavigationItems(role: Role | null): NavigationItem[] {
  return navigationItems.filter((item) => !item.adminOnly || role === "admin");
}
