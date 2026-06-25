export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  attendeeEmail: string;
  createdAt: string;
};

export type AppSessionState = {
  calendarEvents: CalendarEvent[];
};
