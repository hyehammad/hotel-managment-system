"use server";

import { bookingsApi } from "@/lib/api";

export interface BookingInput {
  roomTypeId: number;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender?: "M" | "F" | "Other";
  nationality?: string;
  specialRequests?: string;
}

export interface BookingResult {
  success: boolean;
  message?: string;
  reservationId?: number;
  referenceCode?: string;
  roomNumber?: string;
  roomTypeName?: string;
  ratePerNight?: number;
  totalNights?: number;
  estimatedTotal?: number;
}

// 1. Check availability for a specific room type and date range
export async function checkRoomTypeAvailability(
  roomTypeId: number,
  checkInDate: string,
  checkOutDate: string
): Promise<{ available: boolean; availableCount: number; message?: string }> {
  try {
    const data = await bookingsApi.getAvailableRooms(roomTypeId, checkInDate, checkOutDate);
    return {
      available: data.available || false,
      availableCount: data.availableCount || 0,
      message: data.message,
    };
  } catch (err: any) {
    return { available: false, availableCount: 0, message: err.message || "Failed to check availability." };
  }
}

// 2. Submit a guest reservation
export async function submitGuestBooking(input: BookingInput): Promise<BookingResult> {
  try {
    const res = await bookingsApi.createBooking(input);
    return res;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to submit booking.",
    };
  }
}

// 3. Guest booking lookup
export async function lookupGuestBooking(referenceInput: string, contactInput: string) {
  try {
    const res = await bookingsApi.lookupBooking(referenceInput, contactInput);
    return res;
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Error looking up reservation details.",
    };
  }
}
