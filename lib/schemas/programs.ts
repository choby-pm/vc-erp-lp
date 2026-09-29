import { z } from "zod";
import { STRATEGIES } from "@/lib/labels";
import { optionalAmount } from "./common";

// 출자사업 API 요청 형식 (05 API 설계 3-4)

const isoDate = (message: string) => z.iso.date(message);

export const programSchema = z
  .object({
    budget_id: z.uuid("예산 연도를 고르세요"),
    name: z.string("사업명을 입력하세요").trim().min(1, "사업명을 입력하세요").max(100, "사업명은 100자 이하로 입력하세요"),
    apply_start_date: isoDate("접수 시작일을 입력하세요"),
    apply_end_date: isoDate("접수 종료일을 입력하세요"),
  })
  .refine((v) => v.apply_start_date <= v.apply_end_date, { message: "접수 종료일은 시작일 이후여야 합니다", path: ["apply_end_date"] });
export type ProgramInput = z.infer<typeof programSchema>;

export const trackSchema = z.object({
  name: z.string("부문명을 입력하세요").trim().min(1, "부문명을 입력하세요").max(50, "부문명은 50자 이하로 입력하세요"),
  strategy: z.enum(STRATEGIES, "분야를 고르세요"),
  planned_amount: z.number("출자 예정액을 입력하세요").int("금액은 원 단위 정수로 입력하세요").positive("출자 예정액은 0보다 커야 합니다").max(Number.MAX_SAFE_INTEGER),
  target_gp_count: z.number("선정 GP 수를 입력하세요").int("선정 GP 수는 정수입니다").min(1, "선정 GP 수는 1 이상입니다").max(100),
  min_fund_size_amount: optionalAmount("최소 결성 규모는 0보다 큰 금액으로 입력하세요"),
  max_commitment_ratio: z
    .number("출자 비율 상한을 숫자로 입력하세요")
    .gt(0, "출자 비율 상한은 0%보다 커야 합니다")
    .max(1, "출자 비율 상한은 100% 이하입니다")
    .nullish()
    .transform((v) => (v === null || v === undefined ? null : Number(v.toFixed(6)))),
});
export type TrackInput = z.infer<typeof trackSchema>;
