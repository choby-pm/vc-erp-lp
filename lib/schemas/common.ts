import { z } from "zod";

// 여러 API가 함께 쓰는 입력 형식

// 빈 문자열은 "입력 안 함(null)"으로 바꾼다
export const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v ? v : null));

export const optionalEmail = optionalText(100, "이메일이 너무 깁니다").refine(
  (v) => v === null || z.email().safeParse(v).success,
  "이메일 형식이 올바르지 않습니다",
);

export const optionalPhone = optionalText(30, "전화번호가 너무 깁니다").refine(
  (v) => v === null || /^[0-9+\-() ]+$/.test(v),
  "전화번호는 숫자와 - 만 입력하세요",
);

// 금액: 원 단위 정수 (D3). 비워 두면 null
export const optionalAmount = (message: string) =>
  z
    .number(message)
    .int("금액은 원 단위 정수로 입력하세요")
    .positive(message)
    .max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다")
    .nullish()
    .transform((v) => v ?? null);
