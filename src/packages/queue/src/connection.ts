export interface BullMqConnectionOptions {
  db?: number;
  host: string;
  maxRetriesPerRequest: null;
  password?: string;
  port: number;
  username?: string;
}

export function createBullMqConnectionOptions(
  redisUrl: string,
): BullMqConnectionOptions {
  const url = new URL(redisUrl);
  const dbPath = url.pathname.replace(/^\//, "");

  return {
    ...(dbPath.length === 0 ? {} : { db: Number.parseInt(dbPath, 10) }),
    host: url.hostname,
    maxRetriesPerRequest: null,
    ...(url.password.length === 0
      ? {}
      : { password: decodeURIComponent(url.password) }),
    port: url.port.length === 0 ? 6379 : Number.parseInt(url.port, 10),
    ...(url.username.length === 0
      ? {}
      : { username: decodeURIComponent(url.username) }),
  };
}
