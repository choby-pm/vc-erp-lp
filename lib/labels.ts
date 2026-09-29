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
