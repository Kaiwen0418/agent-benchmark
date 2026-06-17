import { docsBlocks, docsSteps } from "./data";

function CodeSnippetBlock({
  title,
  code,
}: {
  title: string;
  code: string;
}) {
  return (
    <div className="rounded-[1.8rem] border border-[#d8d0c3] bg-[#111111] p-5 text-white">
      <div className="mb-3 text-xs uppercase tracking-[0.22em] text-white/55">{title}</div>
      <pre className="code-block-pre overflow-x-auto text-sm leading-7 text-[#d4f285]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocsSection() {
  return (
    <section id="docs" className="min-h-screen px-6 pb-24 pt-12 md:px-10 lg:px-16 snap-start">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Docs</div>
          <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            Benchmark integration without extra ceremony.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#66625a]">
            Create a run, send the hosted task URL to your agent, and compare the scored result against the same suite rules.
          </p>
        </div>

        {/* Steps */}
        <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {docsSteps.map((item) => (
            <div key={item.step} className="rounded-[1.6rem] border border-[#e0d9ce] bg-white p-5">
              <div className="mb-3 text-xs font-medium tracking-[0.18em] text-[#a09890]">{item.step}</div>
              <div className="mb-2 text-base font-medium text-[#111111]">{item.title}</div>
              <p className="text-sm leading-6 text-[#66625a]">{item.body}</p>
            </div>
          ))}
        </div>

        {/* Code blocks row 1 */}
        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <CodeSnippetBlock title="Create Run" code={docsBlocks.createRun} />
          <CodeSnippetBlock title="Run Response" code={docsBlocks.response} />
        </div>

        {/* Code blocks row 2 */}
        <div className="grid gap-6 md:grid-cols-2">
          <CodeSnippetBlock title="Webhook Payload" code={docsBlocks.webhook} />
        </div>
      </div>
    </section>
  );
}
