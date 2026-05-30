export const commonCopy = {
  productName: "知识库 AI 助手",
  tenantLabel: "私有部署工作区",
  logout: "退出登录",
  returnWorkspace: "返回工作台",
  enterChat: "进入问答",
  actions: {
    search: "搜索",
    filter: "筛选",
    sort: "排序",
    submit: "提交",
    cancel: "取消",
    confirm: "确认",
    close: "关闭",
    retry: "重试",
    reset: "重置",
    viewDetail: "查看详情",
    open: "打开",
    copy: "复制",
  },
  states: {
    loading: "正在加载",
    empty: "暂无数据",
    error: "加载失败，请重试。",
    disabledFuture: "后续版本接入",
  },
} as const;

export const domainTerms = {
  knowledgeBase: "知识库",
  document: "文档",
  task: "任务",
  processingLog: "处理日志",
  citation: "引用",
  feedback: "反馈",
  provider: "模型服务",
  key: "密钥",
  audit: "审计日志",
} as const;
