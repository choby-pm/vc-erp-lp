// 코드 값 ↔ 화면 표시 이름 (02 용어 정의). 🔗 GP와 같은 값은 GP DB의 check 값과 같다

export const GP_TYPES = ["venture_capital", "new_tech_finance", "accelerator", "other"] as const;
export type GpType = (typeof GP_TYPES)[number];
export const GP_TYPE_LABEL: Record<GpType, string> = {
  venture_capital: "벤처투자회사",
  new_tech_finance: "신기술사업금융업자",
  accelerator: "창업기획자",
  other: "기타",
};

export const STRATEGIES = ["early", "growth", "secondary", "overseas", "other"] as const;
export type Strategy = (typeof STRATEGIES)[number];
export const STRATEGY_LABEL: Record<Strategy, string> = {
  early: "초기",
  growth: "성장",
  secondary: "세컨더리",
  overseas: "해외",
  other: "기타",
};

export const FUND_TYPES = ["venture", "new_tech", "individual"] as const;
export type FundType = (typeof FUND_TYPES)[number];
export const FUND_TYPE_LABEL: Record<FundType, string> = {
  venture: "벤처투자조합",
  new_tech: "신기술사업투자조합",
  individual: "개인투자조합",
};

export const FUND_STATUSES = ["planning", "fundraising", "formed", "operating", "dissolved", "liquidated"] as const;
export type FundStatus = (typeof FUND_STATUSES)[number];
export const FUND_STATUS_LABEL: Record<FundStatus, string> = {
  planning: "기획",
  fundraising: "모집 중",
  formed: "결성 완료",
  operating: "운용 중",
  dissolved: "해산",
  liquidated: "청산 완료",
};

export type DataSource = "gp_api" | "manual";
export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  gp_api: "GP 연동",
  manual: "수기 입력",
};

export const PROGRAM_STATUSES = ["draft", "open", "reviewing", "closed"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];
export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  draft: "작성 중",
  open: "접수 중",
  reviewing: "심사 중",
  closed: "선정 완료",
};
// 출자 제안 상태 (02 용어 정의 3장). 심사 단계는 앞으로만 가고 건너뛸 수 있다 (BR-PROP-04)
export const REVIEW_STAGES = ["received", "screening", "due_diligence", "presentation", "committee"] as const;
export type ReviewStage = (typeof REVIEW_STAGES)[number];
export const FINAL_PROPOSAL_STATUSES = ["selected", "rejected", "withdrawn"] as const;
export type ProposalStatus = ReviewStage | (typeof FINAL_PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  received: "접수",
  screening: "서류 심사",
  due_diligence: "현장 실사",
  presentation: "대면 심사",
  committee: "투자심의위원회",
  selected: "선정",
  rejected: "탈락",
  withdrawn: "철회",
};
export const PROPOSAL_STATUS_STYLE: Record<ProposalStatus, string> = {
  received: "bg-slate-100 text-slate-700",
  screening: "bg-sky-100 text-sky-700",
  due_diligence: "bg-sky-100 text-sky-700",
  presentation: "bg-indigo-100 text-indigo-700",
  committee: "bg-violet-100 text-violet-700",
  selected: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  withdrawn: "bg-slate-200 text-slate-500",
};
// 평가표를 쓸 수 있는 심사 단계 (접수 단계는 평가하지 않는다)
export const EVALUATION_STAGES = ["screening", "due_diligence", "presentation", "committee"] as const;
export type EvaluationStage = (typeof EVALUATION_STAGES)[number];

// 결재 (L4)
export type ApprovalTarget = "selection" | "payment" | "vote";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export const APPROVAL_TARGET_LABEL: Record<ApprovalTarget, string> = { selection: "출자 선정", payment: "납입", vote: "총회 투표" };
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = { pending: "결재 대기", approved: "승인", rejected: "반려" };
export const APPROVAL_STATUS_STYLE: Record<ApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export type ProposalChannel = "program" | "direct";
export const PROPOSAL_CHANNEL_LABEL: Record<ProposalChannel, string> = { program: "출자사업 공고", direct: "개별 제안" };

export const PROGRAM_STATUS_STYLE: Record<ProgramStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  open: "bg-amber-100 text-amber-800",
  reviewing: "bg-sky-100 text-sky-700",
  closed: "bg-emerald-100 text-emerald-700",
};

// GP 연동 받은 이벤트 (R3-3, inbound_events)
export type InboundEventStatus = "received" | "processed" | "failed" | "ignored";
export const INBOUND_STATUS_LABEL: Record<InboundEventStatus, string> = { received: "받음 (처리 전)", processed: "처리됨", failed: "실패", ignored: "무시" };
export const INBOUND_STATUS_STYLE: Record<InboundEventStatus, string> = {
  received: "bg-sky-100 text-sky-700",
  processed: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  ignored: "bg-slate-100 text-slate-500",
};
// 🔗 GP 이벤트 종류 (GP lib/services/events.ts)
export const GP_EVENT_TYPE_LABEL: Record<string, string> = {
  "fund.status_changed": "조합 상태 변경",
  "fund.updated": "조합 정보 변경",
  "fund.terms_updated": "규약 변경",
  "notice.sent": "통지 발송",
  "member.joined": "조합원 가입",
  "ledger.entry_created": "원장 기록",
  "meeting.result_finalized": "총회 결과 확정",
};

// 출자 건 (R3-6, BR-CMT-01)
export const COMMITMENT_STATUSES = ["awaiting_formation", "active", "cancelled", "closed"] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];
export const COMMITMENT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  awaiting_formation: "결성 대기",
  active: "활성",
  cancelled: "선정 취소",
  closed: "청산 확인",
};
export const COMMITMENT_STATUS_STYLE: Record<CommitmentStatus, string> = {
  awaiting_formation: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-200 text-slate-500",
  closed: "bg-slate-100 text-slate-700",
};
export type CommitmentOrigin = "selection" | "imported";
export const COMMITMENT_ORIGIN_LABEL: Record<CommitmentOrigin, string> = {
  selection: "선정 결재",
  imported: "가져온 출자 건",
};
export type ReconStatus = "matched" | "mismatched" | "resolved";
export const RECON_STATUS_LABEL: Record<ReconStatus, string> = {
  matched: "일치",
  mismatched: "불일치",
  resolved: "확인 완료",
};
export const RECON_STATUS_STYLE: Record<ReconStatus, string> = {
  matched: "bg-emerald-100 text-emerald-700",
  mismatched: "bg-rose-100 text-rose-700",
  resolved: "bg-sky-100 text-sky-700",
};

// 캐피탈콜 · 우리 쪽 납입 상태 (R4, BR-CALL-05). 저장하지 않고 납입에서 계산한다
export type CallPaymentStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";
export const CALL_PAYMENT_STATUS_LABEL: Record<CallPaymentStatus, string> = {
  pending: "미납",
  partial: "일부 납입",
  paid: "완납",
  overdue: "기한 경과",
  cancelled: "취소",
};
export const CALL_PAYMENT_STATUS_STYLE: Record<CallPaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  partial: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-500",
};
// GP가 본 우리 납입 상태 (🔗 GP v_capital_call_item_status.payment_status)
export const GP_PAYMENT_STATUS_LABEL: Record<string, string> = { pending: "미납", partial: "일부 납입", paid: "완납", overdue: "기한 경과" };

// 납입 상태 (R4-2, BR-PAY-01)
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  requested: "결재 대기",
  approved: "송금 대기",
  paid: "송금 완료",
  rejected: "반려",
  cancelled: "취소",
};
export const PAYMENT_STATUS_STYLE: Record<string, string> = {
  requested: "bg-violet-100 text-violet-700",
  approved: "bg-sky-100 text-sky-700",
  paid: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-200 text-slate-500",
};

// 통지 종류 (R5-1, 🔗 GP NOTICE_TYPES)
export const NOTICE_TYPE_LABEL: Record<string, string> = {
  proposal: "출자 제안",
  capital_call: "캐피탈콜",
  report: "정기 보고",
  meeting: "총회",
  distribution: "분배",
  general: "일반",
};
