/**
 * Client helper: attach a booking to one of the couple's event functions.
 * POSTs to the attach route, which delegates to linkBookingToFunction.
 * Returns true on success.
 */
export async function attachBookingToFunction(
  bookingId: string,
  eventFunctionId: string
): Promise<boolean> {
  try {
    const res = await fetch(`/api/bookings/${bookingId}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_function_id: eventFunctionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
