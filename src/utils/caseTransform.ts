/**
 * Utility functions for transforming between camelCase and snake_case
 * Used for backend API compatibility
 */

export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function transformObjectKeys<T = any>(
  obj: any,
  transformFn: (key: string) => string
): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformObjectKeys(item, transformFn)) as any;
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      const transformedKey = transformFn(key);
      acc[transformedKey] = transformObjectKeys(value, transformFn);
      return acc;
    }, {} as any);
  }

  return obj;
}

export function toSnakeCaseObject<T = any>(obj: any): T {
  return transformObjectKeys(obj, toSnakeCase);
}

export function toCamelCaseObject<T = any>(obj: any): T {
  return transformObjectKeys(obj, toCamelCase);
}
