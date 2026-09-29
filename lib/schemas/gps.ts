import { z } from "zod";
import { GP_TYPES } from "@/lib/labels";
import { optionalAmount, optionalEmail, optionalPhone, optionalText } from "./common";

// 운용사 API 요청 형식 (05 API 설계 3-3)
// 연동 설정(gp_connection_id)은 받지 않는다. 서비스 운영자가 설정 스크립트로만 넣는다 (BR-GP-02)
export const gpSchema = z.object({
  name: z.string("운용사명을 입력하세요").trim().min(1, "운용사명을 입력하세요").max(100, "운용사명은 100자 이하로 입력하세요"),
  gp_type: z.enum(GP_TYPES, "운용사 유형을 고르세요"),
  aum_amount: optionalAmount("운용 규모는 0보다 큰 금액으로 입력하세요"),
  contact_name: optionalText(50, "담당자명은 50자 이하로 입력하세요"),
  contact_email: optionalEmail,
  contact_phone: optionalPhone,
  memo: optionalText(1000, "메모는 1000자 이하로 입력하세요"),
});
export type GpInput = z.infer<typeof gpSchema>;
