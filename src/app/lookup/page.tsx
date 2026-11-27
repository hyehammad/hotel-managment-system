import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LookupClient from "./LookupClient";

export const dynamic = "force-dynamic";

export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; contact?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      <Navbar />
      <main className="flex-1">
        <LookupClient
          initialRef={params?.ref}
          initialContact={params?.contact}
        />
      </main>
      <Footer />
    </div>
  );
}
