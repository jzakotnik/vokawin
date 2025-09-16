// src/services/utils.ts
export const assert = (
  cond: unknown,
  msg = "Assertion failed"
): asserts cond => {
  if (!cond) throw new Error(msg);
};
export const generateAccessCode = (length = 6) =>
  Array.from({ length }, () => Math.floor(Math.random() * 36).toString(36))
    .join("")
    .toUpperCase();
