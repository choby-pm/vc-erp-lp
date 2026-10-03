import { z } from "zod";
import { optionalText } from "./common";

// 총회 · 투표 API 요청 형식 (05 API 설계 3-10, R5-3)

const AGENDA_TYPES = ["formation", "terms_amendment", "manager_change", "report_approval", "dissolution", "other"] as const;

// 투표안 저장: 안건별 찬반(비우면 지움) + 내부 검토 의견 (BR-VOTE-03)
export const votesSaveSchema = z.object({
  votes: z
    .array(
      z.object({
        agenda_id: z.uuid("안건 형식이 올바르지 않습니다"),
        choice: z.enum(["for", "against", "abstain"], "찬성·반대·기권 중에서 고르세요").nullish().transform((v) => v ?? null),
        review_opinion: optionalText(2000, "검토 의견은 2000자 이하로 입력하세요"),
      }),
    )
    .min(1, "안건을 하나 이상 보내세요"),
});
export type VotesSaveInput = z.infer<typeof votesSaveSchema>;

export const voteApprovalSchema = z.object({ request_comment: optionalText(500, "의견은 500자 이하로 입력하세요") });

// 수기 총회 (우편·메일로 받은 소집 통지)
export const manualMeetingSchema = z.object({
  meeting_type: z.enum(["formation", "regular", "extraordinary", "dissolution"], "총회 종류를 고르세요"),
  meeting_date: z.iso.date("총회일을 입력하세요"),
  location: optionalText(200, "장소는 200자 이하로 입력하세요"),
  agendas: z
    .array(
      z.object({
        agenda_type: z.enum(AGENDA_TYPES, "안건 종류를 고르세요"),
        title: z.string("안건 제목을 입력하세요").trim().min(1, "안건 제목을 입력하세요").max(200, "200자 이하로 입력하세요"),
        description: optionalText(2000, "설명은 2000자 이하로 입력하세요"),
      }),
    )
    .min(1, "안건을 하나 이상 입력하세요"),
});
export type ManualMeetingInput = z.infer<typeof manualMeetingSchema>;

export const meetingResultsSchema = z.object({
  results: z.array(z.object({ agenda_id: z.uuid(), result: z.enum(["passed", "rejected"], "가결·부결을 고르세요") })).min(1),
});
export type MeetingResultsInput = z.infer<typeof meetingResultsSchema>;
