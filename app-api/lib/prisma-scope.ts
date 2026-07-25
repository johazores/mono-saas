import { Prisma } from "@prisma/client";

const ENV_SCOPED_MODEL_NAMES = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === "env"))
    .map((model) => model.name),
);

const OPERATIONS_ALLOWING_EMPTY_WHERE = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

type UnknownRecord = Record<string, unknown>;

type RelationMeta = {
  targetModel: string;
  isList: boolean;
  isRequired: boolean;
  fromFields: string[];
  toFields: string[];
};

const MODEL_RELATIONS = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    new Map(
      model.fields
        .filter((field) => field.kind === "object")
        .map((field) => [
          field.name,
          {
            targetModel: field.type,
            isList: field.isList,
            isRequired: field.isRequired,
            fromFields: field.relationFromFields ?? [],
            toFields: field.relationToFields ?? [],
          } satisfies RelationMeta,
        ]),
    ),
  ]),
);

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function appendAnd(where: UnknownRecord, conditions: UnknownRecord[]): void {
  if (conditions.length === 0) return;

  const existing = where.AND;
  if (Array.isArray(existing)) {
    existing.push(...conditions);
    return;
  }

  if (existing !== undefined) {
    where.AND = [existing, ...conditions];
    return;
  }

  where.AND = conditions;
}

/**
 * Replace every explicitly supplied `env` value inside a where tree.
 * This covers top-level filters, logical operators, relation filters, and
 * compound unique selectors such as `env_email` or `env_key`.
 */
function overwriteExplicitEnv(value: unknown, env: string): void {
  if (Array.isArray(value)) {
    for (const item of value) overwriteExplicitEnv(item, env);
    return;
  }
  if (!isRecord(value)) return;

  if (Object.prototype.hasOwnProperty.call(value, "env")) {
    value.env = env;
  }

  for (const child of Object.values(value)) {
    overwriteExplicitEnv(child, env);
  }
}

function setTopLevelEnv(value: unknown, env: string): void {
  if (isRecord(value)) value.env = env;
}

function scopeUniqueSelector(value: unknown, env: string): void {
  for (const selector of asArray(value)) {
    if (!isRecord(selector)) continue;
    overwriteExplicitEnv(selector, env);
    selector.env = env;
  }
}

function readScalarWrite(value: unknown): unknown {
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "set")) {
    return value.set;
  }
  return value;
}

/**
 * Prisma's unchecked create/update inputs can write relation scalar fields
 * such as `userId` directly, bypassing a scoped `connect`. For declared
 * relations to scoped models, normalize non-null scalar foreign keys into a
 * relation connect so the target selector also carries the active scope.
 */
function normalizeRelationScalarWrites(
  model: string,
  data: UnknownRecord,
  env: string,
): void {
  const relations = MODEL_RELATIONS.get(model);
  if (!relations) return;

  for (const [fieldName, relation] of relations) {
    if (
      relation.isList ||
      relation.fromFields.length === 0 ||
      !isEnvScopedModel(relation.targetModel)
    ) {
      continue;
    }

    const presentFields = relation.fromFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(data, field),
    );
    if (presentFields.length === 0) continue;

    if (data[fieldName] !== undefined) {
      throw new Error(
        `Ambiguous relation write for ${model}.${fieldName}: use either relation data or relation scalar fields.`,
      );
    }

    if (presentFields.length !== relation.fromFields.length) {
      throw new Error(
        `Incomplete relation scalar write for ${model}.${fieldName}.`,
      );
    }

    const values = relation.fromFields.map((field) => readScalarWrite(data[field]));

    // Null only removes or omits an optional relation and cannot point across
    // scope, so leave it to Prisma's normal create/update semantics.
    if (values.every((value) => value === null || value === undefined)) continue;

    if (values.some((value) => value === null || value === undefined)) {
      throw new Error(`Partial null relation write for ${model}.${fieldName}.`);
    }

    if (relation.toFields.length !== relation.fromFields.length) {
      throw new Error(`Unsupported relation mapping for ${model}.${fieldName}.`);
    }

    const selector: UnknownRecord = { env };
    relation.toFields.forEach((targetField, index) => {
      selector[targetField] = values[index];
    });

    for (const field of relation.fromFields) delete data[field];
    data[fieldName] = { connect: selector };
  }
}

function scopeCreateData(model: string, value: unknown, env: string): void {
  for (const item of asArray(value)) {
    if (!isRecord(item)) continue;
    if (isEnvScopedModel(model)) item.env = env;
    scopeNestedWrites(model, item, env);
  }
}

function scopeUpdateData(model: string, value: unknown, env: string): void {
  const modelScoped = isEnvScopedModel(model);

  for (const item of asArray(value)) {
    if (!isRecord(item)) continue;

    // Nested update can be either direct data for to-one relations or
    // { where, data } for list relations.
    if (isRecord(item.data)) {
      if (modelScoped && isRecord(item.where)) {
        scopeUniqueSelector(item.where, env);
      }
      if (modelScoped) item.data.env = env;
      scopeNestedWrites(model, item.data, env);
      continue;
    }

    if (modelScoped) item.env = env;
    scopeNestedWrites(model, item, env);
  }
}

function scopeNestedWrites(model: string, data: UnknownRecord, env: string): void {
  normalizeRelationScalarWrites(model, data, env);

  const relations = MODEL_RELATIONS.get(model);
  if (!relations) return;

  for (const [fieldName, relation] of relations) {
    const nested = data[fieldName];
    if (!isRecord(nested)) continue;

    const target = relation.targetModel;
    const targetScoped = isEnvScopedModel(target);

    if (nested.create !== undefined) {
      scopeCreateData(target, nested.create, env);
    }

    if (isRecord(nested.createMany) && nested.createMany.data !== undefined) {
      scopeCreateData(target, nested.createMany.data, env);
    }

    if (targetScoped) {
      if (nested.connect !== undefined) {
        scopeUniqueSelector(nested.connect, env);
      }
      if (nested.set !== undefined) {
        scopeUniqueSelector(nested.set, env);
      }
      if (nested.disconnect !== undefined && nested.disconnect !== true) {
        scopeUniqueSelector(nested.disconnect, env);
      }
      if (nested.delete !== undefined && nested.delete !== true) {
        scopeUniqueSelector(nested.delete, env);
      }
      if (nested.deleteMany !== undefined) {
        for (const where of asArray(nested.deleteMany)) {
          if (!isRecord(where)) continue;
          overwriteExplicitEnv(where, env);
          where.env = env;
        }
      }
    }

    if (nested.connectOrCreate !== undefined) {
      for (const item of asArray(nested.connectOrCreate)) {
        if (!isRecord(item)) continue;
        if (targetScoped && isRecord(item.where)) {
          scopeUniqueSelector(item.where, env);
        }
        if (item.create !== undefined) scopeCreateData(target, item.create, env);
      }
    }

    if (nested.update !== undefined) {
      scopeUpdateData(target, nested.update, env);
    }

    if (nested.updateMany !== undefined) {
      for (const item of asArray(nested.updateMany)) {
        if (!isRecord(item)) continue;
        if (targetScoped && isRecord(item.where)) {
          overwriteExplicitEnv(item.where, env);
          item.where.env = env;
        }
        if (isRecord(item.data)) {
          if (targetScoped) item.data.env = env;
          scopeNestedWrites(target, item.data, env);
        }
      }
    }

    if (nested.upsert !== undefined) {
      for (const item of asArray(nested.upsert)) {
        if (!isRecord(item)) continue;
        if (targetScoped && isRecord(item.where)) {
          scopeUniqueSelector(item.where, env);
        }
        if (item.create !== undefined) scopeCreateData(target, item.create, env);
        if (item.update !== undefined) scopeUpdateData(target, item.update, env);
      }
    }
  }
}

function scopeCountSelection(
  model: string,
  countSelection: UnknownRecord,
  env: string,
): void {
  if (!isRecord(countSelection.select)) return;

  const relations = MODEL_RELATIONS.get(model);
  if (!relations) return;

  for (const [fieldName, relation] of relations) {
    if (!relation.isList || !isEnvScopedModel(relation.targetModel)) continue;

    const selected = countSelection.select[fieldName];
    if (selected === undefined || selected === false) continue;

    if (selected === true) {
      countSelection.select[fieldName] = { where: { env } };
      continue;
    }

    if (!isRecord(selected)) continue;
    if (!isRecord(selected.where)) selected.where = {};
    overwriteExplicitEnv(selected.where, env);
    (selected.where as UnknownRecord).env = env;
  }
}

/**
 * Scope relation selections using schema-derived relation metadata.
 *
 * List relations can carry their own `where`, so they are filtered directly.
 * To-one relations cannot always carry a nested `where`; instead this returns
 * parent-query conditions that require the selected relation to be in the
 * active scope (or null when the relation is optional).
 */
function scopeSelection(
  model: string,
  selection: UnknownRecord,
  env: string,
): UnknownRecord[] {
  if (isRecord(selection._count)) {
    scopeCountSelection(model, selection._count, env);
  }

  const relations = MODEL_RELATIONS.get(model);
  if (!relations) return [];

  const parentConditions: UnknownRecord[] = [];

  for (const [fieldName, relation] of relations) {
    const selected = selection[fieldName];
    if (selected === undefined || selected === false) continue;

    const target = relation.targetModel;
    const targetScoped = isEnvScopedModel(target);
    let nestedArgs: UnknownRecord | null = isRecord(selected) ? selected : null;

    if (relation.isList) {
      if (selected === true) {
        nestedArgs = {};
        selection[fieldName] = nestedArgs;
      }

      if (!nestedArgs) continue;
      if (!isRecord(nestedArgs.where)) nestedArgs.where = {};

      const nestedWhere = nestedArgs.where as UnknownRecord;
      if (targetScoped) {
        overwriteExplicitEnv(nestedWhere, env);
        nestedWhere.env = env;
      }

      const childConditions = scopeNestedSelections(target, nestedArgs, env);
      appendAnd(nestedWhere, childConditions);
      continue;
    }

    const childConditions = nestedArgs
      ? scopeNestedSelections(target, nestedArgs, env)
      : [];

    if (!targetScoped && childConditions.length === 0) continue;

    const targetFilter: UnknownRecord = {};
    if (targetScoped) targetFilter.env = env;
    appendAnd(targetFilter, childConditions);

    const relationMatches = {
      [fieldName]: { is: targetFilter },
    } as UnknownRecord;

    if (relation.isRequired) {
      parentConditions.push(relationMatches);
    } else {
      parentConditions.push({
        OR: [{ [fieldName]: null }, relationMatches],
      });
    }
  }

  return parentConditions;
}

function scopeNestedSelections(
  model: string,
  args: UnknownRecord,
  env: string,
): UnknownRecord[] {
  const conditions: UnknownRecord[] = [];

  if (isRecord(args.include)) {
    conditions.push(...scopeSelection(model, args.include, env));
  }

  if (isRecord(args.select)) {
    conditions.push(...scopeSelection(model, args.select, env));
  }

  return conditions;
}

export function isEnvScopedModel(model: string | undefined): boolean {
  return !!model && ENV_SCOPED_MODEL_NAMES.has(model);
}

export function getEnvScopedModelNames(): string[] {
  return [...ENV_SCOPED_MODEL_NAMES].sort();
}

/**
 * Apply the current deployment-wide environment guard to Prisma arguments.
 * The active environment always wins over caller-provided values.
 *
 * `model` is optional for backwards-compatible unit use. Supplying it enables
 * schema-aware nested relation read/write enforcement.
 */
export function applyEnvScope(
  operation: string,
  args: UnknownRecord,
  env: string,
  model?: string,
): UnknownRecord {
  if (
    OPERATIONS_ALLOWING_EMPTY_WHERE.has(operation) &&
    !isRecord(args.where)
  ) {
    args.where = {};
  }

  if (isRecord(args.where)) {
    overwriteExplicitEnv(args.where, env);
    args.where.env = env;
  }

  if (
    operation === "create" ||
    operation === "update" ||
    operation === "updateMany"
  ) {
    setTopLevelEnv(args.data, env);
  }

  if (operation === "createMany") {
    if (Array.isArray(args.data)) {
      for (const item of args.data) setTopLevelEnv(item, env);
    } else {
      setTopLevelEnv(args.data, env);
    }
  }

  if (operation === "upsert") {
    setTopLevelEnv(args.create, env);
    setTopLevelEnv(args.update, env);
  }

  if (!model) return args;

  if (
    operation === "create" ||
    operation === "update" ||
    operation === "updateMany"
  ) {
    if (isRecord(args.data)) scopeNestedWrites(model, args.data, env);
  }

  if (operation === "createMany") {
    for (const item of asArray(args.data)) {
      if (isRecord(item)) scopeNestedWrites(model, item, env);
    }
  }

  if (operation === "upsert") {
    if (isRecord(args.create)) scopeNestedWrites(model, args.create, env);
    if (isRecord(args.update)) scopeNestedWrites(model, args.update, env);
  }

  const relationConditions = scopeNestedSelections(model, args, env);
  if (relationConditions.length > 0 && isRecord(args.where)) {
    appendAnd(args.where, relationConditions);
  }

  return args;
}
