export const getLogger = (name: string) => {
  return {
    info: (...args: unknown[]) => console.log(`[INFO] [${name}]`, ...args.map(formatLogValue)),
    error: (...args: unknown[]) => console.error(`[ERROR] [${name}]`, ...args.map(formatLogValue)),
  };
};

export function getErrorMessage(error: unknown): string {
  const message = safeReadStringProperty(error, "message");
  if (message) {
    return message;
  }
  return formatLogValue(error);
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  const errorName = safeReadStringProperty(value, "name");
  const errorMessage = safeReadStringProperty(value, "message");
  const errorStack = safeReadStringProperty(value, "stack");
  if (errorName || errorMessage || errorStack) {
    return [errorName || "Error", errorMessage, errorStack].filter(Boolean).join(": ");
  }

  return safeFormatObject(value);
}

function safeReadStringProperty(value: unknown, propertyName: string): string | null {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return null;
  }

  try {
    const propertyValue = Reflect.get(value, propertyName);
    return typeof propertyValue === "string" ? propertyValue : null;
  } catch {
    return null;
  }
}

function safeFormatObject(value: unknown): string {
  if (!value || typeof value !== "object") {
    return String(value);
  }

  const tag = Object.prototype.toString.call(value).slice(8, -1);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const fields = Object.entries(descriptors)
    .slice(0, 12)
    .map(([key, descriptor]) => {
      if (!("value" in descriptor)) {
        return `${key}: [Accessor]`;
      }
      return `${key}: ${formatDescriptorValue(descriptor.value)}`;
    });

  return `${tag}{${fields.join(", ")}}`;
}

function formatDescriptorValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (typeof value === "object") {
    return `[${Object.prototype.toString.call(value).slice(8, -1)}]`;
  }
  return `[${typeof value}]`;
}

export default getLogger;
