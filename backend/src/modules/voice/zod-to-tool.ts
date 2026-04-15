import { ZodTypeAny } from 'zod';

/**
 * Minimal Zod → JSON Schema converter tailored to the validator subset used
 * by our feature modules (strings, numbers, booleans, dates, enums, objects,
 * arrays, optional/nullable/default wrappers).
 *
 * Produces a JSON Schema document compatible with OpenAI's function-calling
 * `parameters` field (OpenAPI 3.0 dialect, not JSON Schema Draft 2020-12).
 *
 * We do this by hand instead of pulling in `zod-to-json-schema` because:
 *   1. Zero new dependencies.
 *   2. We control the output shape — OpenAI tool schemas are stricter than
 *      generic JSON Schema and some features (oneOf, $ref) break free-tier
 *      models silently.
 *   3. The subset of Zod we use is small and stable.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = any;

export interface JsonSchema {
  type?: string;
  description?: string;
  enum?: unknown[];
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  nullable?: boolean;
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def: AnyDef = schema._def;
  const typeName = def.typeName as string;

  switch (typeName) {
    case 'ZodString': {
      const s: JsonSchema = { type: 'string' };
      for (const c of def.checks ?? []) {
        if (c.kind === 'uuid') s.format = 'uuid';
        else if (c.kind === 'url') s.format = 'uri';
        else if (c.kind === 'email') s.format = 'email';
        else if (c.kind === 'min') s.minLength = c.value;
        else if (c.kind === 'max') s.maxLength = c.value;
      }
      return s;
    }

    case 'ZodNumber': {
      const s: JsonSchema = { type: 'number' };
      for (const c of def.checks ?? []) {
        if (c.kind === 'int') s.type = 'integer';
        else if (c.kind === 'min') s.minimum = c.value;
        else if (c.kind === 'max') s.maximum = c.value;
      }
      return s;
    }

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodDate':
      return { type: 'string', format: 'date-time', description: 'ISO-8601 date or datetime string' };

    case 'ZodEnum':
      return { type: 'string', enum: def.values as string[] };

    case 'ZodNativeEnum':
      return { type: 'string', enum: Object.values(def.values as Record<string, string>) };

    case 'ZodLiteral':
      return { enum: [def.value] };

    case 'ZodOptional':
    case 'ZodDefault':
      return zodToJsonSchema(def.innerType);

    case 'ZodNullable': {
      const inner = zodToJsonSchema(def.innerType);
      return { ...inner, nullable: true };
    }

    case 'ZodArray':
      return { type: 'array', items: zodToJsonSchema(def.type) };

    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, rawVal] of Object.entries(shape)) {
        const val = rawVal as ZodTypeAny;
        properties[key] = zodToJsonSchema(val);
        if (!isOptional(val)) required.push(key);
      }
      const out: JsonSchema = { type: 'object', properties };
      if (required.length > 0) out.required = required;
      return out;
    }

    case 'ZodEffects':
      // z.coerce.date() and z.transform()
      return zodToJsonSchema(def.schema);

    case 'ZodUnion':
      // OpenAI tool parameters don't like oneOf; collapse to the first member.
      return zodToJsonSchema(def.options[0]);

    default:
      return {};
  }
}

function isOptional(schema: ZodTypeAny): boolean {
  const t = (schema._def as AnyDef).typeName as string;
  if (t === 'ZodOptional' || t === 'ZodDefault') return true;
  if (t === 'ZodNullable') return isOptional((schema._def as AnyDef).innerType);
  // Zod instances have an `isOptional()` method that checks recursively.
  try {
    return typeof (schema as { isOptional?: () => boolean }).isOptional === 'function'
      && (schema as { isOptional: () => boolean }).isOptional();
  } catch {
    return false;
  }
}

// ==================== Tool type ====================

export interface AgentTool<A = unknown, R = unknown> {
  name: string;
  description: string;
  schema: ZodTypeAny;
  handler: (userId: string, args: A) => Promise<R>;
}

export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

export function toolToOpenAI(tool: AgentTool): OpenAIToolSchema {
  const params = zodToJsonSchema(tool.schema);
  // OpenAI always expects an object at the top level of `parameters`.
  const parameters: JsonSchema =
    params.type === 'object'
      ? params
      : { type: 'object', properties: {} };
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
    },
  };
}
