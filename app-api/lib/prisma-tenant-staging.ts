import { Prisma } from "@prisma/client";

const TENANT_STAGED_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => {
      const fields = new Set(model.fields.map((field) => field.name));
      return fields.has("env") && fields.has("tenantId");
    })
    .map((model) => model.name),
);

const MODEL_RELATIONS = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Map(
      model.fields
        .filter((field) => field.kind === "object")
        .map((field) => [field.name, field.type]),
    ),
  ]),
);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function stageCreateData(model: string, value: unknown, tenantId: string): void {
  for (const item of asArray(value)) {
    if (!isRecord(item)) continue;
    if (TENANT_STAGED_MODELS.has(model)) item.tenantId = tenantId;
    stageNestedCreates(model, item, tenantId);
  }
}

function stageUpdateData(model: string, value: unknown, tenantId: string): void {
  for (const item of asArray(value)) {
    if (!isRecord(item)) continue;
    const data = isRecord(item.data) ? item.data : item;

    // Existing records are still selected/authorized by env during staging.
    // Never allow an update payload to retag one to a caller-selected tenant.
    if (TENANT_STAGED_MODELS.has(model)) delete data.tenantId;

    stageNestedCreates(model, data, tenantId);
  }
}

function stageNestedCreates(
  model: string,
  data: UnknownRecord,
  tenantId: string,
): void {
  const relations = MODEL_RELATIONS.get(model);
  if (!relations) return;

  for (const [fieldName, targetModel] of relations) {
    const nested = data[fieldName];
    if (!isRecord(nested)) continue;

    if (nested.create !== undefined) {
      stageCreateData(targetModel, nested.create, tenantId);
    }

    if (isRecord(nested.createMany) && nested.createMany.data !== undefined) {
      stageCreateData(targetModel, nested.createMany.data, tenantId);
    }

    if (nested.connectOrCreate !== undefined) {
      for (const item of asArray(nested.connectOrCreate)) {
        if (isRecord(item) && item.create !== undefined) {
          stageCreateData(targetModel, item.create, tenantId);
        }
      }
    }

    if (nested.update !== undefined) {
      stageUpdateData(targetModel, nested.update, tenantId);
    }

    if (nested.updateMany !== undefined) {
      for (const item of asArray(nested.updateMany)) {
        if (isRecord(item) && item.data !== undefined) {
          stageUpdateData(targetModel, item.data, tenantId);
        }
      }
    }

    if (nested.upsert !== undefined) {
      for (const item of asArray(nested.upsert)) {
        if (!isRecord(item)) continue;
        if (item.create !== undefined) {
          stageCreateData(targetModel, item.create, tenantId);
        }
        if (item.update !== undefined) {
          stageUpdateData(targetModel, item.update, tenantId);
        }
      }
    }
  }
}

/**
 * During the staged migration, tenantId is trusted request metadata but `env`
 * remains the database authorization scope. Stamp only newly created legacy
 * scoped rows so live writes do not reintroduce null tenant IDs.
 *
 * Existing records are never retagged here. Caller-supplied tenantId values on
 * update paths are discarded; nested creates still receive the verified tenant.
 */
export function applyTenantStagingCreates(
  operation: string,
  args: UnknownRecord,
  tenantId: string,
  model: string,
): UnknownRecord {
  if (operation === "create") {
    stageCreateData(model, args.data, tenantId);
  } else if (operation === "createMany") {
    stageCreateData(model, args.data, tenantId);
  } else if (operation === "update" || operation === "updateMany") {
    stageUpdateData(model, args.data, tenantId);
  } else if (operation === "upsert") {
    stageCreateData(model, args.create, tenantId);
    stageUpdateData(model, args.update, tenantId);
  }

  return args;
}

export function getTenantStagedModelNames(): string[] {
  return [...TENANT_STAGED_MODELS].sort();
}
