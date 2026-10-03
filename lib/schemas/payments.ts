import { z } from "zod";
import { optionalText } from "./common";

// 납입 API 요청 형식 (05 API 설계 3-8·4-2, R4-2)

const amount = (message: string) => z.number(message).int("금액은 원 단위 정수로 입력하세요").positive(message).max(Number.MAX_SAFE_INTEGER);

// 납입 기안 (BR-PAY-02): 금액 · 송금 예정일 · 기안 의견
export const paymentCreateSchema = z.object({
  amount: amount("납입액은 0보다 커야 합니다"),
  planned_date: z.iso.date("송금 예정일 형식이 올바르지 않습니다").nullish().transform((v) => v ?? null),
  request_comment: optionalText(500, "의견은 500자 이하로 입력하세요"),
});
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

// 송금 완료 기록 (BR-PAY-04)
export const paymentMarkPaidSchema = z.object({
  paid_date: z.iso.date("송금일을 입력하세요"),
  bank_reference: optionalText(100, "이체 번호는 100자 이하로 입력하세요"),
});
export type PaymentMarkPaidInput = z.infer<typeof paymentMarkPaidSchema>;

// 취소 · 송금 기록 정정 (BR-PAY-05): 사유 필수
export const paymentCancelSchema = z.object({
  reason: z.string("사유를 입력하세요").trim().min(1, "사유를 입력하세요").max(500, "사유는 500자 이하로 입력하세요"),
});
export type PaymentCancelInput = z.infer<typeof paymentCancelSchema>;
