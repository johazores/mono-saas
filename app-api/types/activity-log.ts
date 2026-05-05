export type ActivityAction =
  | "admin.login"
  | "admin.login_failed"
  | "admin.logout"
  | "admin.locked"
  | "admin.create"
  | "admin.update"
  | "admin.delete"
  | "user.login"
  | "user.login_failed"
  | "user.register"
  | "user.logout"
  | "user.locked"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "profile.update"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "purchase.create"
  | "subscription.cancel"
  | "sub-user.create"
  | "sub-user.revoke"
  | "membership.grant"
  | "membership.revoke"
  | "feature.create"
  | "feature.update"
  | "feature.delete"
  | "setting.update"
  | "checkout.create"
  | "checkout.verify"
  | "price.create"
  | "price.update"
  | "price.delete"
  | "file.download"
  | "billing.portal"
  | "billing.sync"
  | "page.create"
  | "page.update"
  | "page.delete"
  | "content-type.create"
  | "content-type.update"
  | "content-type.delete"
  | "content.create"
  | "content.update"
  | "content.delete"
  | "taxonomy.create"
  | "taxonomy.update"
  | "taxonomy.delete"
  | "taxonomy-term.create"
  | "taxonomy-term.update"
  | "taxonomy-term.delete"
  | "media.create"
  | "media.delete"
  | "block-template.create"
  | "block-template.update"
  | "block-template.delete"
  | "user.impersonate_start"
  | "user.impersonate_stop"
  | "user.invite"
  | "user.invite_accept"
  | "user.invite_revoke";

export type ActivityActor = "admin" | "user" | "system";

export type ActivityLogRecord = {
  id: string;
  env: string;
  actor: ActivityActor;
  actorId: string | null;
  actorEmail: string | null;
  action: ActivityAction;
  resource: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  createdAt: Date;
};

export type CreateActivityLogInput = {
  actor: ActivityActor;
  actorId?: string;
  actorEmail?: string;
  action: ActivityAction;
  resource?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
};

export type ActivityLogFilter = {
  actor?: ActivityActor;
  actorId?: string;
  action?: ActivityAction;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};
