export type RunConnectionRefreshEvent = {
  type: string;
};

export function shouldRefreshHostedConnection(
  metadataRequired: boolean,
  events: RunConnectionRefreshEvent[],
) {
  return metadataRequired && events.some((event) =>
    event.type === "agent.connected" ||
    event.type === "hosted.session.created" ||
    event.type === "hosted.session.progress",
  );
}
