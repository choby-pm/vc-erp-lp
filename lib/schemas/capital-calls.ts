import { z } from "zod";
import { optionalText } from "./common";

// 캐피탈콜 API 요청 형식 (05 API 설계 3-8, R4-1)

const amount = (message: string) => z.number(message).int("금액은 원 단위 정수로 입력하세요").positive(message).max(Number.MAX_SAFE_INTEGER);

// 수기 캐피탈콜 등록 (BR-CALL-02·03). 회차를 비우면 다음 회차
export const capitalCallCreateSchema = z.object({
  call_no: z.number().int("회차는 정수입니다").positive("회차는 1 이상입니다").nullish().transform((v) => v ?? null),
  call_date: z.iso.date("요청일을 입력하세요"),
  due_date: z.iso.date("납입 기한을 입력하세요"),
  call_amount: amount("요청액은 0보다 커야 합니다"),
  purpose: optionalText(200, "목적은 200자 이하로 입력하세요"),
});
export type CapitalCallCreateInput = z.infer<typeof capitalCallCreateSchema>;

export const capitalCallListQuerySchema = z.object({
  status: z.enum(["unpaid", "overdue", "all"]).optional(),
  commitment_id: z.uuid().optional(),
});
export type CapitalCallListQuery = z.infer<typeof capitalCallListQuerySchema>;
