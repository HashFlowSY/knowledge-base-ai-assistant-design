export const adminCopy = {
  tasks: {
    title: "任务队列",
    description: "查看文件和 URL 导入任务的排队、处理、失败和重试状态。",
    empty: "暂无任务，请先上传文件或导入网页。",
    error: "任务队列加载失败，请重试。请求编号：req-task-demo。",
  },
  logs: {
    title: "处理日志",
    description: "查看文档处理过程中的脱敏事件和错误摘要。",
    empty: "当前筛选条件下暂无处理日志。",
    error: "处理日志加载失败，请重试。请求编号：req-log-demo。",
  },
  providers: {
    title: "模型服务",
    description: "配置问答、向量和重排 Provider。",
    empty: "暂无模型服务配置，请添加必需的 Provider。",
    error: "模型服务配置加载失败，请重试。请求编号：req-provider-demo。",
  },
  users: {
    title: "用户管理",
    description: "管理用户账号、admin/member 角色和访问状态。",
    empty: "暂无用户，请新增用户。",
    error: "用户列表加载失败，请重试。请求编号：req-user-demo。",
  },
  audit: {
    title: "审计日志",
    description: "查看管理员和系统动作的脱敏审计记录。",
    empty: "当前筛选条件下暂无审计日志。",
    error: "审计日志加载失败，请重试。请求编号：req-audit-demo。",
  },
  createUser: "新增用户",
  createUserDescription: "直接创建本地演示账号，设置初始密码，并写入审计摘要。",
  editUser: "编辑用户",
  editUserDescription: "修改用户姓名、邮箱、角色、访问状态，或填写新密码完成重置。",
  disabled: {
    adminTaskAction: "member 用户可查看任务状态，重试和取消仅限 admin。",
    retry: "仅失败且未超过最大尝试次数的任务可重试。",
    cancel: "仅排队中或运行中的任务可取消。",
    disabledUser: "该用户已停用。",
    openTarget: "该目标暂无独立页面。",
  },
  validation: {
    nameRequired: "请输入用户姓名。",
    emailRequired: "请输入有效邮箱。",
    passwordRequired: "请输入用户密码。",
  },
  confirmHighImpact: "该操作会更新本地演示状态并写入审计摘要，是否继续？",
} as const;
