"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import { PROPOSAL_STATUS_LABEL, type EvaluationStage } from "@/lib/labels";

// 심사 평가 (R2-3, BR-EVAL-01~05): 내 평가표 쓰기 + 전체 평가표 · 단계별 평균

type Criterion = { id: string; name: string; weight_ratio: number };
type Evaluation = {
  id: string;
  stage: EvaluationStage;
  evaluator_id: string;
  evaluator_name: string;
  evaluated_date: string;
  opinion: string | null;
  weighted_score: number;
  scores: { criterion_id: string; criterion_name: string; weight_ratio: number; score: number }[];
};

export default function EvaluationPanel({
  proposalId,
  myId,
  canEvaluate,
  stages,
  criteria,
  weightSum,
  evaluations,
  stageAverages,
  overallAvg,
}: {
  proposalId: string;
  myId: string;
  canEvaluate: boolean;
  stages: EvaluationStage[];
  criteria: Criterion[];
  weightSum: number;
  evaluations: Evaluation[];
  stageAverages: { stage: string; count: number; avg_score: number }[];
  overallAvg: number | null;
}) {
  const router = useRouter();
  const [picked, setStage] = useState<EvaluationStage | "">(stages[stages.length - 1] ?? "");
  // 단계를 옮기면 평가 가능한 단계가 늘어난다. 고른 단계가 없거나 목록에 없으면 가장 최근 단계를 쓴다
  const stage: EvaluationStage | "" = picked && stages.includes(picked) ? picked : (stages[stages.length - 1] ?? "");
  const mine = evaluations.find((e) => e.stage === stage && e.evaluator_id === myId);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [opinion, setOpinion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // 단계를 바꾸면 그 단계의 내 평가표로 채운다
  const valueOf = (id: string) => scores[`${stage}:${id}`] ?? String(mine?.scores.find((s) => s.criterion_id === id)?.score ?? "");
  const opinionValue = opinion ?? mine?.opinion ?? "";
  const preview = criteria.reduce((s, c) => s + (Number(valueOf(c.id)) || 0) * c.weight_ratio, 0);
  const weightOk = Math.abs(weightSum - 1) < 1e-9;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">심사 평가</h2>
        <p className="text-xs text-slate-500">
          {overallAvg === null ? "평가표 없음" : `평가표 ${evaluations.length}개 · 전체 평균 ${overallAvg}점`}
          {stageAverages.map((s) => ` · ${PROPOSAL_STATUS_LABEL[s.stage as EvaluationStage]} ${s.avg_score}점(${s.count})`).join("")}
        </p>
      </div>

      {canEvaluate && (
        <div className="border-b border-slate-200 px-5 py-4">
          {stages.length === 0 ? (
            <p className="text-sm text-slate-500">서류 심사 이후 단계로 옮기면 평가표를 쓸 수 있습니다.</p>
          ) : !weightOk ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">평가 항목 가중치 합계가 {(weightSum * 100).toFixed(1)}%라 평가할 수 없습니다. 관리자가 평가 항목을 100%로 맞춰야 합니다.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700">내 평가표</span>
                <select
                  aria-label="평가 단계"
                  value={stage}
                  onChange={(e) => {
                    setStage(e.target.value as EvaluationStage);
                    setOpinion(null);
                    setSaved(false);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {PROPOSAL_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                {mine && <span className="text-xs text-slate-500">저장된 평가표를 고칩니다 ({formatDate(mine.evaluated_date)})</span>}
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                {criteria.map((c) => (
                  <label key={c.id} className="block">
                    <span className="text-xs font-medium text-slate-600">
                      {c.name} <span className="text-slate-400">({Math.round(c.weight_ratio * 100)}%)</span>
                    </span>
                    <input
                      inputMode="numeric"
                      value={valueOf(c.id)}
                      onChange={(e) => {
                        setScores({ ...scores, [`${stage}:${c.id}`]: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) });
                        setSaved(false);
                      }}
                      placeholder="0~100"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums"
                    />
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">종합 의견</span>
                <textarea value={opinionValue} onChange={(e) => setOpinion(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-sm text-slate-600">
                  가중 점수 <b className="tabular-nums">{preview.toFixed(1)}</b>점
                </span>
                {saved && <span className="text-sm text-emerald-700">저장했습니다</span>}
                {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
                <button
                  type="button"
                  disabled={pending || !stage}
                  onClick={async () => {
                    setPending(true);
                    setError(null);
                    const res = await fetch(`/api/v1/proposals/${proposalId}/evaluations/${stage}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        opinion: opinionValue,
                        scores: criteria.map((c) => ({ criterion_id: c.id, score: valueOf(c.id) === "" ? null : Number(valueOf(c.id)) })),
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    setPending(false);
                    if (!res.ok) {
                      setError(data.error?.details?.fields ? "모든 항목에 0~100 점수를 입력하세요" : (data.error?.message ?? "저장하지 못했습니다"));
                      return;
                    }
                    setSaved(true);
                    router.refresh();
                  }}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {pending ? "저장하는 중…" : "평가표 저장"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {evaluations.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">아직 평가표가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-5 py-2">단계</th>
                <th className="px-5 py-2">심사위원</th>
                {evaluations[0].scores.map((s) => (
                  <th key={s.criterion_id} className="px-3 py-2 text-right">
                    {s.criterion_name}
                  </th>
                ))}
                <th className="px-5 py-2 text-right">가중 점수</th>
                <th className="px-5 py-2">의견</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-2.5 text-slate-600">{PROPOSAL_STATUS_LABEL[e.stage]}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-900">
                    {e.evaluator_name}
                    <span className="ml-1 text-xs font-normal text-slate-400">{formatDate(e.evaluated_date)}</span>
                  </td>
                  {evaluations[0].scores.map((h) => (
                    <td key={h.criterion_id} className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                      {e.scores.find((s) => s.criterion_id === h.criterion_id)?.score ?? "-"}
                    </td>
                  ))}
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-slate-900">{e.weighted_score}</td>
                  <td className="max-w-xs truncate px-5 py-2.5 text-slate-600" title={e.opinion ?? ""}>
                    {e.opinion ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-400">점수는 판단 자료입니다. 점수로 자동 선정·탈락하지 않습니다 (BR-EVAL-05).</p>
    </section>
  );
}
