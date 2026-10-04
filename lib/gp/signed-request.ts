import { AppError } from "@/lib/api/errors";
import { loadConnection, MAX_SKEW_MS, sameSignature, signatureOf } from "@/lib/gp/inbox";

// GP가 LP를 부르는 요청 확인 (R8, L50 · GP D47). GP가 LP를 부르는 첫 API라 새 키를 만들지 않고 웹훅과 같은 비밀 값을 쓴다
// · 헤더: X-LP-Connection-Id (LP 쪽 연동 설정 ID — GP의 LP_SYSTEM_WEBHOOK_URL 끝에 있는 값), X-GP-Timestamp, X-GP-Signature
// · 서명 = sha256=HMAC(비밀 값, 타임스탬프 + "." + "<METHOD> <경로+쿼리>\n<본문>") — 웹훅 서명과 같은 함수에 요청 줄을 더한 것
// · 틀리면 401, 5분 넘게 차이 나면 401 (웹훅과 같다, BR-SYNC-01)

export const canonicalRequest = (method: string, pathWithQuery: string, body: string) => `${method.toUpperCase()} ${pathWithQuery}\n${body}`;

export async function verifyGpRequest(request: Request, rawBody = ""): Promise<{ connectionId: string }> {
  const unauthorized = (message: string) => new AppError(401, "INVALID_SIGNATURE", message, "BR-SYNC-01");
  const connectionId = request.headers.get("x-lp-connection-id") ?? "";
  const timestamp = request.headers.get("x-gp-timestamp") ?? "";
  const signature = request.headers.get("x-gp-signature") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(connectionId) || !timestamp || !signature) throw unauthorized("서명 헤더가 없습니다 (X-LP-Connection-Id · X-GP-Timestamp · X-GP-Signature)");

  const connection = await loadConnection(connectionId).catch(() => null);
  if (!connection) throw unauthorized("서명이 맞지 않습니다");
  const secret = process.env[connection.webhook_secret_env];
  if (!secret) throw new AppError(503, "GP_NOT_CONFIGURED", `서명 비밀 값 환경 변수가 비어 있습니다 (${connection.webhook_secret_env})`);

  const url = new URL(request.url);
  const expected = signatureOf(secret, timestamp, canonicalRequest(request.method, url.pathname + url.search, rawBody));
  if (!sameSignature(signature, expected)) throw unauthorized("서명이 맞지 않습니다");
  const sentAt = Date.parse(timestamp);
  if (Number.isNaN(sentAt) || Math.abs(Date.now() - sentAt) > MAX_SKEW_MS) throw unauthorized("타임스탬프가 5분 범위를 벗어났습니다");
  return { connectionId };
}
