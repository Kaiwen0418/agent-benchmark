import { docsBlocks } from "./data";

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
      <pre className="overflow-x-auto text-sm leading-7 text-[#d4f285]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocsSection() {
  return (
    <section id="docs" className="px-6 pb-24 pt-12 md:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <div className="text-xs uppercase tracking-[0.24em] text-[#726b5f]">Docs</div>
          <h2 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-[#111111] md:text-5xl">
            Minimal integration docs, directly on the homepage.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#66625a]">
            Keep the path short: connect your agent, run a benchmark, and watch the result. Everything else can come later.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <CodeSnippetBlock title="MCP Config" code={docsBlocks.mcp} />
          <CodeSnippetBlock title="REST Example" code={docsBlocks.rest} />
        </div>
      </div>
    </section>
  );
}
