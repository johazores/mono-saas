import type { NextApiResponse } from "next";
import * as z from "zod";

export type ValidationErrorDetails = {
  fields: Record<string, string[]>;
};

function validationDetails(error: z.ZodError): ValidationErrorDetails {
  const fields: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "_root";
    (fields[field] ??= []).push(issue.message);
  }

  return { fields };
}

/**
 * Parse an untrusted request body at the controller boundary.
 *
 * Returns typed, normalized data on success. On failure it writes a stable 400
 * response with field-level details and returns null so controllers can stop.
 */
export function parseRequestBody<T>(
  res: NextApiResponse,
  schema: z.ZodType<T>,
  input: unknown,
): T | null {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  res.status(400).json({
    ok: false,
    error: "Invalid request.",
    details: validationDetails(result.error),
  });
  return null;
}
