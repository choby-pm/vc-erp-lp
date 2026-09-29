import { z } from "zod";
import { FUND_STATUSES, FUND_TYPES, STRATEGIES } from "@/lib/labels";
import { optionalAmount, optionalText } from "./common";

// 조합 API 요청 형식 (05 API 설계 3-3, L18)

const optionalRatio = (label: string) =>
  z
    .number(`${label}을 숫자로 입력하세요`)
    .min(0, `${label}은 0% 이상입니다`)
    .max(1, `${label}은 100% 이하입니다`)
    .nullish()
    .transform((v) => (v === null || v === undefined ? null : Number(v.toFixed(6))));

const optionalYears = (label: string) =>
  z.number(`${label}을 숫자로 입력하세요`).int(`${label}은 정수(년)로 입력하세요`).min(1, `${label}은 1년 이상입니다`).max(30, `${label}이 너무 깁니다`).nullish().transform((v) => v ?? null);

// 수기 조합의 기본 정보. 결성 정보(결성일·결성액)와 상태는 상태 변경 API로만 바꾼다 (BR-FUND-02)
export const fundSchema = z
  .object({
    name: z.string("조합명을 입력하세요").trim().min(1, "조합명을 입력하세요").max(100, "조합명은 100자 이하로 입력하세요"),
    fund_type: z.enum(FUND_TYPES, "조합 유형을 고르세요"),
    strategy: z.enum(STRATEGIES, "분야를 고르세요"),
    target_amount: optionalAmount("목표 결성액은 0보다 큰 금액으로 입력하세요"),
    term_years: optionalYears("존속 기간"),
    investment_period_years: optionalYears("투자 기간"),
    management_fee_rate: optionalRatio("관리보수율"),
    carry_rate: optionalRatio("성과보수율"),
    hurdle_rate: optionalRatio("기준수익률"),
    primary_purpose: optionalText(200, "주목적 투자 분야는 200자 이하로 입력하세요"),
    primary_purpose_min_ratio: optionalRatio("주목적 의무 비율"),
  })
  .refine((v) => v.term_years === null || v.investment_period_years === null || v.investment_period_years <= v.term_years, {
    message: "투자 기간은 존속 기간보다 길 수 없습니다",
    path: ["investment_period_years"],
  });
export type FundInput = z.infer<typeof fundSchema>;

export const fundCreateSchema = fundSchema.and(
  z.object({
    gp_id: z.uuid("운용사를 고르세요"),
    status: z.enum(["planning", "fundraising"], "처음 상태는 기획 또는 모집 중입니다").default("fundraising"),
  }),
);
export type FundCreateInput = z.infer<typeof fundCreateSchema>;

const isoDate = z.iso.date("날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)");

// 수기 조합 상태 변경 (BR-FUND-01·02). 결성 완료 이후로 처음 갈 때 결성일·결성액을 함께 받는다
export const fundStatusSchema = z.object({
  status: z.enum(FUND_STATUSES, "상태를 고르세요"),
  formation_date: isoDate.nullish().transform((v) => v ?? null),
  fund_size_amount: optionalAmount("결성액은 0보다 큰 금액으로 입력하세요"),
});
export type FundStatusInput = z.infer<typeof fundStatusSchema>;

export const fundListQuerySchema = z.object({
  status: z.enum(FUND_STATUSES).optional(),
  strategy: z.enum(STRATEGIES).optional(),
  data_source: z.enum(["gp_api", "manual"]).optional(),
  gp_id: z.uuid().optional(),
});
export type FundListQuery = z.infer<typeof fundListQuerySchema>;
