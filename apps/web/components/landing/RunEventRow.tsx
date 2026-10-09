import type { HostedInteractionContext } from "@agentbench/protocol";

export function RunEventRow({ label, timestamp, detail, interaction }: {
  label: string;
  timestamp: string;
  detail: string;
  interaction?: HostedInteractionContext;
}) {
  const fields = interaction ? [
    ["App", interaction.app], ["Case", interaction.caseNumber?.toString()],
    ["Action", interaction.action], ["Target", interaction.target], ["Route", interaction.route],
    ["From", interaction.from], ["Destination", interaction.destination],
    ["Outcome", interaction.outcome], ["Input contents", interaction.contents],
  ].filter((field) => field[1]) : [];
  return (
    <details className="group rounded-lg px-2 py-1.5 open:bg-[#fbf8f3]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-xs text-[#292620]">
        <span className="min-w-0 break-words"><span aria-hidden="true" className="mr-1 text-[#8f897e]"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">-</span></span>{detail}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-[#8f897e]">{timestamp}</span>
      </summary>
      <dl className="mt-2 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-t border-[#e8e4da] pt-2 text-[11px]">
        <dt className="text-[#6a655c]">Event</dt><dd className="break-words">{label}</dd>
        <dt className="text-[#6a655c]">Time</dt><dd>{timestamp}</dd>
        {fields.map(([name, value]) => <div key={name} className="contents"><dt className="text-[#6a655c]">{name}</dt><dd className="break-words">{value}</dd></div>)}
        {!interaction ? <><dt className="text-[#6a655c]">Context</dt><dd>Not recorded for this event.</dd></> : null}
      </dl>
    </details>
  );
}
