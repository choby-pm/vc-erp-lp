import { z } from "zod";

// 분배 API 요청 형식 (05 API 설계 3-11, R6-1)

const won = (message: string) => z.number(message).int("금액은 원 단위 정수로 입력하세요").min(0, message).max(Number.MAX_SAFE_INTEGER);

// 수기 분배 (BR-DIST-02): 원금 반환 + 수익 = 금액 (금액은 둘의 합으로 정한다)
export const distributionCreateSchema = z
  .object({
    distribution_no: z.number().int().positive().nullish().transform((v) => v ?? null),
    distribution_date: z.iso.date("분배일을 입력하세요"),
    return_of_capital_amount: won("원금 반환은 0 이상입니다"),
    profit_amount: won("수익은 0 이상입니다"),
    is_final: z.boolean().default(false),
  })
  .refine((v) => v.return_of_capital_amount + v.profit_amount > 0, { message: "분배 금액은 0보다 커야 합니다", path: ["return_of_capital_amount"] });
export type DistributionCreateInput = z.infer<typeof distributionCreateSchema>;

export const distributionReceiveSchema = z.object({ received_date: z.iso.date("수령일을 입력하세요") });
export type DistributionReceiveInput = z.infer<typeof distributionReceiveSchema>;

export const distributionCorrectSchema = z.object({
  reason: z.string("정정 사유를 입력하세요").trim().min(1, "정정 사유를 입력하세요").max(500, "500자 이하로 입력하세요"),
});
