export const bootstrapCopy = {
  eyebrow: "本地开发骨架",
  title: "知识库 AI 助手",
  description:
    "当前版本只提供应用入口、包边界、基础工具链和本地依赖服务，为后续认证、知识库、导入任务和问答功能开发做准备。",
  statusItems: [
    {
      label: "Web",
      value: "Next.js 管理端和聊天端入口已预留。",
    },
    {
      label: "API",
      value: "Hono 服务提供基础健康检查。",
    },
    {
      label: "Worker",
      value: "BullMQ worker 生命周期入口已预留。",
    },
  ],
} as const;
