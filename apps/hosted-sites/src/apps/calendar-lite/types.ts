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
};

export type AppSessionState = {
  calendarEvents: CalendarEvent[];
};
