import GpForm from "@/components/gp-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getGp } from "@/lib/services/gps";
import { loadOrNotFound } from "@/lib/page-helpers";

export const metadata = { title: "운용사 수정 · VC ERP LP" };

export default async function EditGpPage(props: PageProps<"/gps/[gpId]/edit">) {
  const { gpId } = await props.params;
  const me = (await getCurrentUser())!;
  const gp = await loadOrNotFound(() => getGp(me.org_id, gpId));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">운용사 수정</h1>
      <GpForm gp={gp} />
    </div>
  );
}
