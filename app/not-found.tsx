import Link from "next/link";

// 없는 주소이거나, 다른 기관의 데이터 주소로 들어온 경우 (BR-ORG-03: 있다는 사실도 알려주지 않는다)
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-16">
      <div className="text-center">
        <p className="text-sm font-semibold text-emerald-600">404</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">찾을 수 없습니다</h1>
        <p className="mt-2 text-sm text-slate-500">주소가 잘못되었거나 볼 수 없는 데이터입니다.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
          대시보드로
        </Link>
      </div>
    </main>
  );
}
