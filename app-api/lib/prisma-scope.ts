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

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Replace every explicitly supplied `env` value inside a where tree.
 * This covers top-level filters, logical operators, relation filters, and
 * compound unique selectors such as `env_email` or `env_key`.
 *
 * It intentionally does not add missing scope to arbitrary nested objects;
 * Prisma filter objects and JSON filters are indistinguishable at runtime.
 * Full nested relation isolation remains a separate tenancy task.
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

export function isEnvScopedModel(model: string | undefined): boolean {
  return !!model && ENV_SCOPED_MODEL_NAMES.has(model);
}

export function getEnvScopedModelNames(): string[] {
  return [...ENV_SCOPED_MODEL_NAMES].sort();
}

/**
 * Apply the current deployment-wide environment guard to Prisma arguments.
 * The active environment always wins over caller-provided values.
 */
export function applyEnvScope(
  operation: string,
  args: UnknownRecord,
  env: string,
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

  if (operation === "create" || operation === "update" || operation === "updateMany") {
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

  return args;
}
