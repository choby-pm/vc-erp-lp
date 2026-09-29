import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";

export const userCreateSchema = z.object({
  email: z.email("이메일 형식이 아닙니다").transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().min(1, "이름을 입력하세요").max(50),
  role: z.enum(ROLES, "역할을 고르세요"),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(50),
});

export const userRoleSchema = z.object({
  role: z.enum(ROLES, "역할을 고르세요"),
});

export const orgUpdateSchema = z.object({
  name: z.string().trim().min(1, "기관명을 입력하세요").max(100),
});
