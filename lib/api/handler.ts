import { z } from "zod";
import { authorize } from "@/lib/auth/permissions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { withJosa } from "@/lib/format";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/services/audit";
import { AppError } from "./errors";
import { fail, readJson } from "./response";

// 로그인이 필요한 API의 공통 처리 — 기관과 역할을 한곳에서 검사한다 (BR-ORG-01, BR-AUTH-02)
//   1. 로그인 확인 → 없으면 401
//   2. 역할 권한 확인 → 없으면 403
//   3. 본래 처리 실행. 기관 ID는 user.org_id 하나뿐이다 (주소·본문의 기관 ID는 받지 않는다, L14)
//   4. 던져진 오류를 공통 실패 응답으로 변환
//   5. 쓰기 요청이면 결과와 함께 감사 로그를 남긴다 (막힌 요청 포함)
export function withOrgUser<Ctx>(handler: (request: Request, ctx: Ctx, user: CurrentUser) => Promise<Response>) {
  return async (request: Request, ctx: Ctx) => {
    const user = await getCurrentUser().catch(() => null);
    if (!user) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다");
    const path = new URL(request.url).pathname;
    let res: Response;
    try {
      const decision = authorize(user.role, request.method, path.replace(/^\/api\/v1/, ""));
      res = decision.allowed
        ? await handler(request, ctx, user)
        : fail(403, "FORBIDDEN", `${withJosa(decision.area, "은는")} ${decision.roles.map((r) => ROLE_LABEL[r]).join("·")} 권한이 필요합니다 (내 권한: ${ROLE_LABEL[user.role]})`, { rule: "BR-AUTH-02" });
    } catch (err) {
      res = toErrorResponse(err);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      await writeAudit({ actor_type: "user", user, method: request.method, path, status: res.status, error_code: await errorCodeOf(res), request });
    }
    return res;
  };
}

export function toErrorResponse(err: unknown) {
  if (err instanceof AppError) {
    return fail(err.status, err.code, err.message, { rule: err.rule, details: err.details });
  }
  // DB 제약 조건 위반 — 서버 검사를 통과했더라도 DB가 최후에 막은 경우 (03 7장)
  const pgCode = (err as { code?: string }).code;
  if (pgCode === "23505") return fail(409, "CONFLICT", "이미 같은 값이 등록되어 있습니다");
  if (pgCode === "23503") return fail(404, "NOT_FOUND", "연결할 대상을 찾을 수 없습니다"); // 다른 기관 데이터를 가리킨 경우도 여기 (BR-ORG-04)
  if (pgCode === "23514" || pgCode === "P0001" || pgCode === "23001") {
    return fail(422, "CONSTRAINT_VIOLATION", "데이터 규칙에 맞지 않습니다");
  }
  console.error(err);
  return fail(500, "INTERNAL_ERROR", "서버 오류가 발생했습니다. 잠시 후 다시 시도하세요");
}

// 응답에서 오류 코드만 꺼낸다 (본문은 그대로 돌려줘야 하므로 복제해서 읽는다)
async function errorCodeOf(res: Response) {
  if (res.status < 400) return null;
  try {
    return ((await res.clone().json()) as { error?: { code?: string } }).error?.code ?? null;
  } catch {
    return null;
  }
}

// 요청 본문을 읽고 검사한다. 문제가 있으면 400 VALIDATION_ERROR (항목별 안내 포함)
export async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  return validateBody(await readJson(request), schema);
}

// 이미 읽은 본문을 검사한다 (멱등성 처리처럼 본문을 먼저 읽어야 하는 경우)
export function validateBody<T extends z.ZodType>(body: unknown, schema: T): z.infer<T> {
  if (body === null) throw new AppError(400, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다");

  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new AppError(400, "VALIDATION_ERROR", "입력값을 확인하세요", undefined, { fields });
  }
  return result.data;
}
