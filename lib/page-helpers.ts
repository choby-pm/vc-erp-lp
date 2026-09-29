import { notFound } from "next/navigation";
import { AppError } from "@/lib/api/errors";

// 화면에서 데이터를 읽다가 "없음(404)" 오류가 나면 Next.js의 404 화면을 보여준다
export async function loadOrNotFound<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    throw err;
  }
}
