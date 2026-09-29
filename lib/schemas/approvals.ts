import { z } from "zod";
import { optionalText } from "./common";

// 선정 조건 · 결재 API 요청 형식 (05 API 설계 3-6, R2-4)

export const selectionTermsSchema = z.object({
  budget_id: z.uuid("예산 연도를 고르세요"),
  planned_amount: z.number("출자 예정액을 입력하세요").int("금액은 원 단위 정수로 입력하세요").positive("출자 예정액은 0보다 커야 합니다").max(Number.MAX_SAFE_INTEGER),
  max_commitment_ratio: z
    .number("출자 비율 상한을 숫자로 입력하세요")
    .gt(0, "출자 비율 상한은 0%보다 커야 합니다")
    .max(1, "출자 비율 상한은 100% 이하입니다")
    .nullish()
    .transform((v) => (v === null || v === undefined ? null : Number(v.toFixed(6)))),
  formation_deadline: z.iso.date("결성 기한을 입력하세요"),
  key_person_condition: optionalText(500, "핵심 운용 인력 조건은 500자 이하로 입력하세요"),
});
export type SelectionTermsInput = z.infer<typeof selectionTermsSchema>;

export const approvalRequestSchema = z.object({
  request_comment: optionalText(1000, "기안 의견은 1000자 이하로 입력하세요"),
});

export const approvalDecisionSchema = z.object({
  decision_comment: optionalText(1000, "의견은 1000자 이하로 입력하세요"),
});

export const approvalListQuerySchema = z.object({
  box: z.enum(["to_me", "mine", "all"]).default("to_me"),
  status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;
