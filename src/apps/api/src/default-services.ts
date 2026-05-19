import type {
  ApiServiceError,
  AuditService,
  AuthService,
  UserService,
} from "./contracts";

export function createUnauthenticatedAuthService(): AuthService {
  return {
    async login() {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "邮箱或密码不正确。",
      };
    },
    async logout() {
      return { ok: true };
    },
    async getSession() {
      return {
        ok: false,
        code: "UNAUTHORIZED",
        httpStatus: 401,
        message: "请先登录。",
      };
    },
  };
}

export function createNoopAuditService(): AuditService {
  return {
    async recordForbiddenAdminAttempt() {
      return undefined;
    },
  };
}

export function createEmptyUserService(): UserService {
  return {
    async listUsers() {
      return {
        ok: true,
        page: {
          items: [],
          page: 1,
          pageSize: 8,
          total: 0,
        },
      };
    },
    async createUser() {
      return createNotImplementedServiceError();
    },
    async getUser() {
      return createNotImplementedServiceError();
    },
    async updateUser() {
      return createNotImplementedServiceError();
    },
    async removeUserAccess() {
      return createNotImplementedServiceError();
    },
  };
}

function createNotImplementedServiceError(): ApiServiceError {
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    httpStatus: 500,
    message: "操作失败，请稍后重试。",
  };
}
