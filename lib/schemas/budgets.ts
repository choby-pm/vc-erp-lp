import { z } from "zod";
import { STRATEGIES } from "@/lib/labels";
import { optionalText } from "./common";

// 출자 예산 API 요청 형식 (05 API 설계 3-4)

const amount = (message: string) => z.number(message).int("금액은 원 단위 정수로 입력하세요").min(0, message).max(Number.MAX_SAFE_INTEGER, "금액이 너무 큽니다");

export const budgetCreateSchema = z.object({
  budget_year: z.number("연도를 입력하세요").int().min(2000, "연도를 확인하세요").max(2100, "연도를 확인하세요"),
  total_amount: amount("예산 총액은 0 이상으로 입력하세요"),
  memo: optionalText(1000, "메모는 1000자 이하로 입력하세요"),
});
export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;

export const budgetUpdateSchema = budgetCreateSchema.omit({ budget_year: true });
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;

// 분야별 배분 통째로 저장. 0원인 분야는 배분 없음으로 본다
export const allocationsSchema = z.object({
  allocations: z
    .array(z.object({ strategy: z.enum(STRATEGIES, "분야를 고르세요"), amount: amount("배분액은 0 이상으로 입력하세요") }))
    .refine((list) => new Set(list.map((a) => a.strategy)).size === list.length, "같은 분야가 두 번 들어 있습니다"),
});
export type AllocationsInput = z.infer<typeof allocationsSchema>;
