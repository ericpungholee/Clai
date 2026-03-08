export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const errorData = (await response.json()) as Record<string, unknown>;
      const detail =
        typeof errorData.detail === "string"
          ? errorData.detail
          : typeof errorData.message === "string"
            ? errorData.message
            : JSON.stringify(errorData);

      if (detail) {
        return detail;
      }
    }

    const text = await response.text();
    if (text) {
      return text;
    }
  } catch {
    // Fall back to the default message below.
  }

  return `Request failed with status ${response.status}`;
}

export async function fetchOk(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchOk(input, init);

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function fetchBlob(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Blob> {
  const response = await fetchOk(input, init);
  return response.blob();
}
