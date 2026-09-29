// 화면을 불러오는 동안 바로 보여주는 자리 표시 (loading.tsx). 클릭하자마자 화면이 바뀌어 기다리는 느낌을 줄인다

const bar = "animate-pulse rounded-lg bg-slate-200/70";

export function ContentSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="불러오는 중">
      <div className="grid gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <div className={`${bar} h-3 w-20`} />
            <div className={`${bar} mt-3 h-5 w-28`} />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className={`${bar} h-4 w-40`} />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`${bar} h-4`} style={{ width: `${90 - i * 8}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className={`${bar} h-7 w-48`} />
      <ContentSkeleton />
    </div>
  );
}
