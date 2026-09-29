import GpForm from "@/components/gp-form";

export const metadata = { title: "운용사 등록 · VC ERP LP" };

export default function NewGpPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">운용사 등록</h1>
      <GpForm />
    </div>
  );
}
