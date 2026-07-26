export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T | null;
  meta: Record<string, unknown> | null;
}

export function response<T>(
  status: number,
  message: string,
  data: T | null = null,
  meta: Record<string, unknown> | null = null,
): ApiResponse<T> {
  return { status, message, data, meta };
}
