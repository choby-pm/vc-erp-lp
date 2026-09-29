import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// 비밀번호는 복원할 수 없는 형태(scrypt 해시)로만 저장한다.
// 저장 형식: scrypt$<salt>$<hash>  (salt: 사용자마다 다른 무작위 값)

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;

  const expected = Buffer.from(hashText, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltText, "base64url"), expected.length);
  // 비교 시간이 항상 같아서, 응답 속도로 비밀번호를 추측할 수 없다
  return timingSafeEqual(actual, expected);
}

// 임시 비밀번호: 헷갈리기 쉬운 글자(0/O, 1/l/I)를 뺀 12자리
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
