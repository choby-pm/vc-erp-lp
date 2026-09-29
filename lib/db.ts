import postgres from "postgres";

// SQL을 직접 작성해 실행하는 DB 연결 (GP lib/db.ts 와 같은 방식).
// 사용 예: const rows = await sql`select * from funds where org_id = ${orgId}`
// ${} 로 넣은 값은 자동으로 안전하게 처리되어 SQL 인젝션이 생기지 않는다.

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    // Neon 커넥션 풀러(pgbouncer)를 거치므로 준비된 문장(prepared statement)을 쓰지 않는다
    prepare: false,
    types: {
      // 금액(bigint)을 문자열 대신 숫자로 받는다. 자바스크립트 숫자는 약 9,007조까지 정확하다
      bigint: {
        to: 20,
        from: [20],
        parse: (value: string) => Number(value),
        serialize: (value: number) => value.toString(),
      },
      // 날짜(date)는 "2026-09-28" 문자열 그대로 주고받는다 (시간대 차이로 하루가 밀리지 않게)
      date: {
        to: 1082,
        from: [1082],
        parse: (value: string) => value,
        serialize: (value: string | Date) =>
          value instanceof Date ? value.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) : value,
      },
    },
  });

// 개발 중 파일이 바뀔 때마다 연결이 새로 쌓이지 않도록 재사용한다
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
