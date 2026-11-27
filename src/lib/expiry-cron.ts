import { prisma } from "@/lib/prisma";

export async function expireOverdueReservations() {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

  // 1. Find all pending reservations older than 24 hours
  const overdueReservations = await prisma.reservations.findMany({
    where: {
      status: "pending",
      created_at: {
        lte: cutoffTime,
      },
    },
    include: {
      reservation_rooms: true,
    },
  });

  if (overdueReservations.length === 0) {
    return { cancelledCount: 0, roomIdsReleased: [] };
  }

  const cancelledIds = overdueReservations.map((r) => r.reservation_id);
  const roomIdsToRelease: number[] = [];

  for (const r of overdueReservations) {
    for (const rr of r.reservation_rooms) {
      roomIdsToRelease.push(rr.room_id);
    }
  }

  // 2. Mark reservations as cancelled
  await prisma.reservations.updateMany({
    where: {
      reservation_id: { in: cancelledIds },
    },
    data: {
      status: "cancelled",
      cancel_reason: "Automatically cancelled: 24-hour staff confirmation deadline exceeded",
    },
  });

  // 3. Set rooms back to available
  if (roomIdsToRelease.length > 0) {
    await prisma.rooms.updateMany({
      where: {
        room_id: { in: roomIdsToRelease },
        status: { not: "maintenance" },
      },
      data: {
        status: "available",
      },
    });
  }

  return {
    cancelledCount: cancelledIds.length,
    cancelledIds,
    roomIdsReleased: roomIdsToRelease,
  };
}
