// 서비스 코드가 규칙 위반을 알릴 때 던지는 오류.
// API 핸들러가 받아서 05 API 설계 2-3의 실패 응답으로 바꾼다.
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public rule?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

// what 에는 조사까지 넣는다. 예: notFound("출자 제안을")
export const notFound = (what: string) => new AppError(404, "NOT_FOUND", `${what} 찾을 수 없습니다`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 주소에 들어온 ID가 UUID 형식이 아니면 DB에 묻지 않고 바로 "없음"으로 처리한다
export function assertUuid(id: string, what: string) {
  if (!UUID.test(id)) throw notFound(what);
}
