export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  details?: {
    fields?: Record<string, string[]>;
  };
};

export type ListResponse<T> = {
  items: T[];
};
