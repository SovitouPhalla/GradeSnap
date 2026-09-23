import { missingPublicEnv } from "@/lib/env";

export function SetupBanner() {
  const missingKeys = missingPublicEnv();

  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="font-semibold">Supabase environment variables are not configured yet.</p>
      <p className="mt-2 leading-6">
        Add the missing values to <code>.env.local</code> to enable auth and persistence:
      </p>
      <ul className="mt-2 list-disc pl-5">
        {missingKeys.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
    </div>
  );
}
