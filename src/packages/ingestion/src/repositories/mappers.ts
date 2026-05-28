export function parseDocumentVersion(value: string): number {
  const normalized = value.startsWith("v") ? value.slice(1) : value;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid document version.");
  }

  return parsed;
}
