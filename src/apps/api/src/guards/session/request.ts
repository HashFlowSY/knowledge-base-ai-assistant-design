import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";

import type { ApiEnv } from "../../contracts";

const missingRemoteAddressIpSummary = "unknown";
const ipv4MappedIpv6Prefix = "::ffff:";

export function getRequestIpSummary(context: Context<ApiEnv>): string {
  return resolveTrustedClientIpSummary({
    remoteAddress: getServerRemoteAddress(context),
  });
}

export function resolveTrustedClientIpSummary(input: {
  remoteAddress: string | null | undefined;
}): string {
  return normalizeRemoteAddress(input.remoteAddress) ?? missingRemoteAddressIpSummary;
}

function getServerRemoteAddress(context: Context<ApiEnv>): string | null {
  try {
    return getConnInfo(context).remote.address ?? null;
  } catch (error) {
    if (error instanceof TypeError) {
      return null;
    }

    throw error;
  }
}

function normalizeRemoteAddress(
  remoteAddress: string | null | undefined,
): string | null {
  const trimmed = remoteAddress?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.startsWith(ipv4MappedIpv6Prefix)) {
    const mappedIpv4 = normalized.slice(ipv4MappedIpv6Prefix.length);
    return mappedIpv4.length > 0 ? mappedIpv4 : normalized;
  }

  return normalized;
}
