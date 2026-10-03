import { z } from "zod";
import { optionalText } from "./common";

// 통지함 API 요청 형식 (05 API 설계 3-10, R5-1)

export const NOTICE_TYPES = ["proposal", "capital_call", "report", "meeting", "distribution", "general"] as const;

// 수기 통지 기록 (BR-NTC-01): 우편·메일로 받은 통지
export const noticeCreateSchema = z.object({
  fund_id: z.uuid("조합을 고르세요").nullish().transform((v) => v ?? null),
  notice_type: z.enum(NOTICE_TYPES, "통지 종류를 고르세요"),
  title: z.string("제목을 입력하세요").trim().min(1, "제목을 입력하세요").max(200, "제목은 200자 이하로 입력하세요"),
  body: optionalText(5000, "내용은 5000자 이하로 입력하세요"),
  received_date: z.iso.date("받은 날을 입력하세요"),
});
export type NoticeCreateInput = z.infer<typeof noticeCreateSchema>;

export const noticeListQuerySchema = z.object({
  unacknowledged: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  type: z.enum(NOTICE_TYPES).optional(),
  fund_id: z.uuid().optional(),
});
export type NoticeListQuery = { unacknowledged?: boolean; type?: (typeof NOTICE_TYPES)[number]; fund_id?: string };
