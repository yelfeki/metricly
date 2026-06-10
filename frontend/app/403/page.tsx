import Link from "next/link"

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="card p-12 text-center max-w-sm w-full">
        <p
          className="font-playfair text-7xl font-black"
          style={{ color: "rgba(15,40,65,0.15)" }}
        >
          403
        </p>
        <h1 className="section-heading mt-2">Access restricted</h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(10,30,51,0.5)" }}>
          This section requires admin access. Contact your administrator if you need access.
        </p>
        <Link href="/surveys" className="btn-primary mt-6 inline-flex">
          Go to Assessments
        </Link>
      </div>
    </div>
  )
}
