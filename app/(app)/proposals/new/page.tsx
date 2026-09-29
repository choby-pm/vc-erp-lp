import ProposalForm from "@/components/proposal-form";
import { getCurrentUser } from "@/lib/auth/session";
import { listGps } from "@/lib/services/gps";
import { listFundsForProposal, listOpenTracks } from "@/lib/services/proposals";

export const metadata = { title: "제안 접수 · VC ERP LP" };

// 출자 제안 접수 (R2-3). 연동 GP의 제안은 GP에서 자동으로 들어오므로 수기 운용사·조합만 고른다 (BR-PROP-03)
export default async function NewProposalPage(props: PageProps<"/proposals/new">) {
  const me = (await getCurrentUser())!;
  const { track_id } = await props.searchParams;
  const [tracks, funds, gps] = await Promise.all([listOpenTracks(me.org_id), listFundsForProposal(me.org_id), listGps(me.org_id)]);
  const defaultTrackId = typeof track_id === "string" && tracks.some((t) => t.id === track_id) ? track_id : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">출자 제안 접수</h1>
      <ProposalForm
        tracks={tracks}
        funds={funds}
        gps={gps.filter((g) => !g.is_linked).map((g) => ({ id: g.id, name: g.name }))}
        defaultTrackId={defaultTrackId}
      />
    </div>
  );
}
