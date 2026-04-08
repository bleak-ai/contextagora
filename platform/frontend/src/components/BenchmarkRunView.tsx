import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { downloadBenchmarkRunUrl, getBenchmarkRun } from "../api/benchmarks";

const MD_COMPONENTS = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
};

function splitSections(md: string): { header: string; sections: string[] } {
  const parts = md.split(/\n(?=## )/);
  return { header: parts[0] ?? "", sections: parts.slice(1) };
}

export function BenchmarkRunView() {
  const { taskId, runId } = useParams({
    from: "/benchmarks/$taskId/$runId",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["benchmark-run", taskId, runId],
    queryFn: () => getBenchmarkRun(taskId, runId),
  });

  const split = data ? splitSections(data.markdown) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-bg/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/benchmarks/$taskId"
            params={{ taskId }}
            className="text-xs text-text-muted hover:text-text-secondary"
          >
            &larr; {taskId}
          </Link>
          <h1 className="text-sm font-semibold text-text font-mono">
            {runId}
          </h1>
        </div>
        <a
          href={downloadBenchmarkRunUrl(taskId, runId)}
          className="px-3 py-1.5 text-xs border border-border rounded hover:bg-bg-hover text-text-muted"
        >
          Download .md
        </a>
      </div>

      <div className="px-4 py-4">
        {isLoading && (
          <p className="text-sm text-text-muted">Loading run...</p>
        )}
        {error && (
          <p className="text-sm text-danger">
            {(error as Error).message || "Failed to load run"}
          </p>
        )}
        {split && (
          <div className="benchmark-md w-full">
            {/* Full-width header (title + metadata list) */}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {split.header}
            </ReactMarkdown>

            {/* Two columns on lg+: explicit placement, each side independent */}
            <div className="mt-4 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:items-start">
              {split.sections.map((section, i) => (
                <section key={i} className="lg:min-w-0 mt-6 lg:mt-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={MD_COMPONENTS}
                  >
                    {section}
                  </ReactMarkdown>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
