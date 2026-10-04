import { z } from "zod";
import { STRATEGIES } from "@/lib/labels";

// 공고 게시판 조회 조건 (R8-1)
export const boardQuerySchema = z.object({
  strategy: z.enum(STRATEGIES).optional(),
  org_id: z.uuid().optional(),
  status: z.enum(["open", "reviewing"]).optional(),
});
