import { z } from "zod";
import { optionalText } from "./common";

// GP 보고 API 요청 형식 (05 API 설계 3-10, R5-2)

const ratio = z
  .number("비율을 숫자로 입력하세요")
  .min(0, "0% 이상이어야 합니다")
  .max(1, "100% 이하여야 합니다")
  .nullish()
  .transform((v) => (v === null || v === undefined ? null : Number(v.toFixed(6))));

// 수기 보고 (BR-RPT-02·05). 같은 기간이면 is_correction 으로만
export const reportCreateSchema = z.object({
  period_type: z.enum(["monthly", "quarterly", "semiannual", "annual"], "보고 종류를 고르세요"),
  period_start: z.iso.date("기간 시작일을 입력하세요"),
  period_end: z.iso.date("기간 종료일을 입력하세요"),
  received_date: z.iso.date("받은 날을 입력하세요"),
  nav_amount: z.number("우리 몫 평가액을 입력하세요").int("원 단위 정수로 입력하세요").min(0, "평가액은 0 이상입니다").max(Number.MAX_SAFE_INTEGER).nullish().transform((v) => v ?? null),
  primary_purpose_ratio: ratio,
  gp_comment: optionalText(2000, "GP 의견은 2000자 이하로 입력하세요"),
  is_correction: z.boolean().default(false),
});
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;

// 조건 준수 점검 기록 (BR-CHK-01). 연동 보고는 실제 비율을 GP 스냅샷에서 채우므로 비워도 된다
export const complianceCheckSchema = z.object({
  actual_ratio: ratio,
  memo: optionalText(500, "메모는 500자 이하로 입력하세요"),
});
export type ComplianceCheckInput = z.infer<typeof complianceCheckSchema>;

export const reportListQuerySchema = z.object({
  unreviewed: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  fund_id: z.uuid().optional(),
});
export type ReportListQuery = { unreviewed?: boolean; fund_id?: string };
