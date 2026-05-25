export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function hasRequestBody(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  const contentLength = request.headers.get("content-length");

  return (
    (contentLength !== null && contentLength !== "0") ||
    (contentType !== null && contentType.toLowerCase().includes("application/json"))
  );
}
