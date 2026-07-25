import type { NextApiRequest } from "next";
import type { AuthRequest } from "./types";

export function toAuthRequest(req: NextApiRequest): AuthRequest {
  const origin = req.headers.origin;

  return {
    authorization: req.headers.authorization,
    cookies: { ...req.cookies },
    origin: typeof origin === "string" ? origin : undefined,
  };
}
