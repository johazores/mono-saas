import type { NextApiRequest } from "next";
import { getAuthSession } from "@/lib/admin-auth";
import { getUserSession } from "@/lib/user-auth";
import { getRequestScope } from "@/lib/request-scope";
import { activityLogService } from "@/services/activity-log-service";
import { getClientIp } from "@/lib/request-utils";
import type { ActivityAction, ActivityActor } from "@/types";

function getUserAgent(req: NextApiRequest): string | undefined {
  const ua = req.headers["user-agent"];
  return typeof ua === "string" ? ua.slice(0, 512) : undefined;
}

export async function logActivity(
  req: NextApiRequest,
  action: ActivityAction,
  details?: {
    actor?: ActivityActor;
    actorId?: string;
    actorEmail?: string;
    resource?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  let actor: ActivityActor = details?.actor ?? "system";
  let actorId = details?.actorId;
  let actorEmail = details?.actorEmail;

  // Auto-detect actor from session if not explicitly provided
  if (!actorId) {
    const adminSession = await getAuthSession(req);
    if (adminSession) {
      actor = "admin";
      actorId = adminSession.admin.id;
      actorEmail = adminSession.admin.email;
    } else {
      const userSession = await getUserSession(req);
      if (userSession) {
        actor = "user";
        actorId = userSession.user.id;
        actorEmail = userSession.user.email;
      }
    }
  }

  const scope = getRequestScope();
  const metadata = {
    ...(details?.metadata ?? {}),
    ...(scope?.requestId ? { requestId: scope.requestId } : {}),
    ...(scope?.tenantId ? { tenantId: scope.tenantId } : {}),
  };

  await activityLogService.log({
    actor,
    actorId,
    actorEmail,
    action,
    resource: details?.resource,
    resourceId: details?.resourceId,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    ip: getClientIp(req),
    userAgent: getUserAgent(req),
    method: req.method,
    path: req.url,
  });
}
