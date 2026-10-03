import { z } from "zod";
import { COMMITMENT_STATUSES } from "@/lib/labels";

// 출자 건 API 요청 형식 (05 API 설계 3-7, R3-6)

const amount = (message: string) => z.number(message).int("금액은 원 단위 정수로 입력하세요").positive(message).max(Number.MAX_SAFE_INTEGER);

// 수기 조합의 결성 확인: 약정액·결성액·결성일을 한 번에 (L25). 연동 조합은 본문 없음 (GP 값)
export const commitmentConfirmSchema = z
  .object({
    commitment_amount: amount("약정액은 0보다 커야 합니다"),
    fund_size_amount: amount("결성액은 0보다 커야 합니다"),
    formation_date: z.iso.date("결성일을 입력하세요"),
  })
  .refine((v) => v.commitment_amount <= v.fund_size_amount, { message: "약정액이 결성액보다 클 수 없습니다", path: ["commitment_amount"] });
export type CommitmentConfirmInput = z.infer<typeof commitmentConfirmSchema>;

// 결성 확인표 미리 보기 (수기: 입력 중인 값으로)
export const formationCheckQuerySchema = z.object({
  commitment_amount: z.coerce.number().int().positive().optional(),
  fund_size_amount: z.coerce.number().int().positive().optional(),
  formation_date: z.iso.date().optional(),
});

export const commitmentCancelSchema = z.object({
  reason: z.string("취소 사유를 입력하세요").trim().min(1, "취소 사유를 입력하세요").max(500, "사유는 500자 이하로 입력하세요"),
});
export type CommitmentCancelInput = z.infer<typeof commitmentCancelSchema>;

// 약정 변경 (BR-CMT-06): 새 약정액 · 변경일 · 사유
export const commitmentAdjustSchema = z.object({
  new_amount: amount("새 약정액은 0보다 커야 합니다"),
  entry_date: z.iso.date("변경일을 입력하세요"),
  memo: z.string("변경 사유를 입력하세요").trim().min(1, "변경 사유를 입력하세요 (예: 규약 변경 안건 가결)").max(500, "사유는 500자 이하로 입력하세요"),
});
export type CommitmentAdjustInput = z.infer<typeof commitmentAdjustSchema>;

// 대사 불일치 확인 (BR-REC-05)
export const reconResolveSchema = z.object({
  resolution_memo: z.string("확인 사유를 입력하세요").trim().min(1, "확인 사유를 입력하세요").max(500, "사유는 500자 이하로 입력하세요"),
});

export const commitmentListQuerySchema = z.object({
  status: z.enum(COMMITMENT_STATUSES).optional(),
});
export type CommitmentListQuery = z.infer<typeof commitmentListQuerySchema>;
