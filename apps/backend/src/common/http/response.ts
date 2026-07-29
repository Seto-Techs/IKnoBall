export interface ApiResponse<T> {
  is_success: boolean;
  message: string;
  data: T | null;
}

export function response<T>(
  is_success: boolean,
  message: string,
  data: T | null = null,
): ApiResponse<T> {
  return { is_success, message, data };
}
