import Link from "next/link"

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div className="text-center">
        <p className="text-6xl font-black text-slate-200">403</p>
        <h1 className="mt-2 text-xl font-bold text-slate-800">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-500">
          This section requires admin access. Contact your administrator if you need access.
        </p>
        <Link
          href="/surveys"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          Go to Assessments
        </Link>
      </div>
    </div>
  )
}
