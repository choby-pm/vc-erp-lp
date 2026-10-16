export const todayKst = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
export const AS_OF_ERROR = "기준일은 실제 존재하는 날짜를 YYYY-MM-DD 형식으로 입력해주세요.";

// 미입력은 오늘, 명시한 잘못된 날짜는 오류. 미래 날짜도 허용한다.
export function performanceDate(raw: string | string[] | undefined | null): string | null {
  if (raw === undefined || raw === null || raw === "") return todayKst();
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith("0000-")) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}
