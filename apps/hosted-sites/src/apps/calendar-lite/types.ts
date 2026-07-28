export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  attendeeEmail: string;
  secondaryAttendeeEmail?: string;
  resource?: string;
  occurrences?: number;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
};

export type CalendarAvailabilityCheck = {
  id: string;
  checkNumber: number;
  status: "pending" | "updated";
  eventId: string;
  baselineRevisionCount: number;
  createdAt: string;
};

export type AppSessionState = {
  calendarEvents: CalendarEvent[];
  calendarAvailabilityChecks: CalendarAvailabilityCheck[];
};
