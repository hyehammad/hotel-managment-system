import { bookingsApi } from "@/lib/api";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingClient from "./BookingClient";

export const dynamic = "force-dynamic";

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const initialTypeId = params?.type ? parseInt(params.type, 10) : undefined;

  let formattedRoomTypes: any[] = [];
  try {
    const data = await bookingsApi.getPublicHome();
    const roomTypes = data.roomTypes || [];
    formattedRoomTypes = roomTypes.map((rt: any) => ({
      room_type_id: rt.room_type_id,
      name: rt.name,
      description: rt.description,
      base_price: parseFloat(rt.base_price.toString()),
      max_adults: rt.max_adults,
      max_children: rt.max_children,
      bed_type: rt.bed_type,
    }));
  } catch (err) {
    console.error("Failed to load room types from API:", err);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
      <Navbar />
      <main className="flex-1">
        <BookingClient
          roomTypes={formattedRoomTypes}
          initialRoomTypeId={initialTypeId}
        />
      </main>
      <Footer />
    </div>
  );
}
