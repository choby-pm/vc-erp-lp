import { z } from "zod";
import { EVALUATION_STAGES, FUND_TYPES, GP_TYPES, REVIEW_STAGES, STRATEGIES } from "@/lib/labels";
import { optionalAmount, optionalText } from "./common";

// 출자 제안 · 심사 API 요청 형식 (05 API 설계 3-5, R2-3)

const isoDate = (message: string) => z.iso.date(message);
const amount = (message: string) => z.number(message).int("금액은 원 단위 정수로 입력하세요").positive(message).max(Number.MAX_SAFE_INTEGER);
const optionalRatio = z
  .number("비율을 숫자로 입력하세요")
  .min(0, "0% 이상이어야 합니다")
  .max(1, "100% 이하여야 합니다")
  .nullish()
  .transform((v) => (v === null || v === undefined ? null : Number(v.toFixed(6))));

// 새 조합: 기존 운용사(gp_id)이거나 새 운용사(new_gp)를 함께 만든다 (BR-PROP-02, L18)
const newFundSchema = z
  .object({
    gp_id: z.uuid("운용사를 고르세요").nullish(),
    new_gp: z.object({ name: z.string("운용사명을 입력하세요").trim().min(1, "운용사명을 입력하세요").max(100), gp_type: z.enum(GP_TYPES, "운용사 유형을 고르세요") }).nullish(),
    name: z.string("조합명을 입력하세요").trim().min(1, "조합명을 입력하세요").max(100, "조합명은 100자 이하로 입력하세요"),
    fund_type: z.enum(FUND_TYPES, "조합 유형을 고르세요"),
    strategy: z.enum(STRATEGIES, "분야를 고르세요"),
    target_amount: optionalAmount("목표 결성액은 0보다 큰 금액으로 입력하세요"),
    term_years: z.number().int().min(1).max(30).nullish().transform((v) => v ?? null),
    investment_period_years: z.number().int().min(1).max(30).nullish().transform((v) => v ?? null),
    management_fee_rate: optionalRatio,
    carry_rate: optionalRatio,
    hurdle_rate: optionalRatio,
  })
  .refine((v) => Boolean(v.gp_id) !== Boolean(v.new_gp), { message: "기존 운용사를 고르거나 새 운용사를 입력하세요", path: ["gp_id"] });

export const proposalCreateSchema = z
  .object({
    proposal_channel: z.enum(["program", "direct"], "제안 경로를 고르세요"),
    program_track_id: z.uuid("모집 부문을 고르세요").nullish(),
    fund_id: z.uuid("조합을 고르세요").nullish(),
    new_fund: newFundSchema.nullish(),
    requested_amount: amount("요청 출자액은 0보다 커야 합니다"),
    received_date: isoDate("접수일을 입력하세요"),
    memo: optionalText(1000, "메모는 1000자 이하로 입력하세요"),
  })
  .refine((v) => v.proposal_channel === "direct" || Boolean(v.program_track_id), { message: "공고형 제안은 모집 부문이 필요합니다", path: ["program_track_id"] })
  .refine((v) => v.proposal_channel === "program" || !v.program_track_id, { message: "개별 제안에는 모집 부문을 넣지 않습니다", path: ["program_track_id"] })
  .refine((v) => Boolean(v.fund_id) !== Boolean(v.new_fund), { message: "기존 조합을 고르거나 새 조합을 입력하세요", path: ["fund_id"] });
export type ProposalCreateInput = z.infer<typeof proposalCreateSchema>;

export const proposalUpdateSchema = z.object({
  requested_amount: amount("요청 출자액은 0보다 커야 합니다"),
  received_date: isoDate("접수일을 입력하세요"),
  memo: optionalText(1000, "메모는 1000자 이하로 입력하세요"),
});
export type ProposalUpdateInput = z.infer<typeof proposalUpdateSchema>;

export const stageMoveSchema = z.object({
  to_status: z.enum(REVIEW_STAGES.filter((s) => s !== "received") as [string, ...string[]], "옮길 심사 단계를 고르세요"),
  note: optionalText(500, "메모는 500자 이하로 입력하세요"),
});

export const decideSchema = z.object({
  decided_date: isoDate("결정일을 입력하세요").nullish().transform((v) => v ?? null),
  note: optionalText(500, "사유는 500자 이하로 입력하세요"),
});

export const proposalListQuerySchema = z.object({
  status: z.enum([...REVIEW_STAGES, "selected", "rejected", "withdrawn", "open", "closed"]).optional(),
  program_id: z.uuid().optional(),
  channel: z.enum(["program", "direct"]).optional(),
});
export type ProposalListQuery = z.infer<typeof proposalListQuerySchema>;

// ─── 평가 항목 · 평가표 ──────────────────────────────────────────────────────

export const criterionSchema = z.object({
  name: z.string("항목명을 입력하세요").trim().min(1, "항목명을 입력하세요").max(50, "항목명은 50자 이하로 입력하세요"),
  weight_ratio: z.number("가중치를 입력하세요").gt(0, "가중치는 0%보다 커야 합니다").max(1, "가중치는 100% 이하입니다").transform((v) => Number(v.toFixed(6))),
  sort_order: z.number().int().min(0).max(999).default(0),
});
export type CriterionInput = z.infer<typeof criterionSchema>;

export const evaluationStageSchema = z.enum(EVALUATION_STAGES, "평가할 심사 단계를 고르세요");

export const evaluationSchema = z.object({
  evaluated_date: isoDate("평가일을 입력하세요").nullish().transform((v) => v ?? null),
  opinion: optionalText(2000, "의견은 2000자 이하로 입력하세요"),
  scores: z
    .array(z.object({ criterion_id: z.uuid("평가 항목이 올바르지 않습니다"), score: z.number("점수를 입력하세요").int("점수는 정수입니다").min(0, "점수는 0~100입니다").max(100, "점수는 0~100입니다") }))
    .min(1, "점수를 입력하세요"),
});
export type EvaluationInput = z.infer<typeof evaluationSchema>;
