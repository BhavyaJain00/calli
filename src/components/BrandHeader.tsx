export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
        C
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Calliser</h1>
      <p className="text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
