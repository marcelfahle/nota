import { setGlobalModel, setWorkspaceModel } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { getAdminAi } from "@/lib/admin-data";
import { ALLOWED_MODELS, MODEL_PRICES } from "@/lib/ai-usage";

function cost(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: value < 0.01 ? 4 : 2,
    style: "currency",
  }).format(value);
}

export default async function AdminAiPage() {
  const data = await getAdminAi();
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="space-y-2">
        <p className="nota-label">Runtime configuration</p>
        <h1>AI models and prompts</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Costs are estimates from recorded tokens and the prices in code. Parallel Extract and fast
          Search are estimated at $0.001 per successful request.
        </p>
      </div>

      <dl className="grid border-y sm:grid-cols-2">
        <div className="p-4 sm:border-r">
          <dt className="text-xs text-muted-foreground">This month</dt>
          <dd className="mt-1 font-mono text-lg font-semibold">
            {data.thisMonth.requests} requests · {cost(data.thisMonth.cost)} estimated
          </dd>
        </div>
        <div className="border-t p-4 sm:border-t-0">
          <dt className="text-xs text-muted-foreground">Last month</dt>
          <dd className="mt-1 font-mono text-lg font-semibold">
            {data.lastMonth.requests} requests · {cost(data.lastMonth.cost)} estimated
          </dd>
        </div>
      </dl>

      <section aria-labelledby="features-heading" className="space-y-4">
        <h2 className="text-lg font-semibold" id="features-heading">
          Model calls
        </h2>
        <div className="divide-y rounded-md border">
          {data.features.map((feature) => (
            <article className="space-y-5 p-4 sm:p-5" key={feature.feature}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{feature.label}</h3>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{feature.source}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fallback: {feature.env} · active: {feature.modelId}
                  </p>
                </div>
                <form action={setGlobalModel} className="flex flex-wrap items-center gap-2">
                  <input name="feature" type="hidden" value={feature.feature} />
                  <label className="sr-only" htmlFor={`global-${feature.feature}`}>
                    Model for {feature.label}
                  </label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-[28rem]"
                    defaultValue={feature.modelId}
                    id={`global-${feature.feature}`}
                    name="modelId"
                  >
                    {ALLOWED_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {MODEL_PRICES[model].label} · {model}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" type="submit" variant="outline">
                    Save
                  </Button>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">System prompt</summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap">
                  {feature.prompt}
                </pre>
              </details>
              {feature.tools.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Tools ({feature.tools.length})
                  </summary>
                  <ul className="mt-3 divide-y rounded-md border">
                    {feature.tools.map((tool) => (
                      <li className="p-3 text-sm" key={tool.name}>
                        <code className="font-semibold">{tool.name}</code>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {tool.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="overrides-heading" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold" id="overrides-heading">
            Workspace overrides
          </h2>
          <p className="text-sm text-muted-foreground">An override wins over the global model.</p>
        </div>
        <div className="divide-y rounded-md border">
          {data.workspaces.map((workspace) => {
            const override = data.overrides.find(
              (item) => item.orgId === workspace.id && item.feature === "chat",
            );
            return (
              <form
                action={setWorkspaceModel}
                className="flex flex-wrap items-center gap-3 p-3"
                key={workspace.id}
              >
                <input name="feature" type="hidden" value="chat" />
                <input name="orgId" type="hidden" value={workspace.id} />
                <span className="min-w-48 flex-1 text-sm font-medium">{workspace.name}</span>
                <select
                  aria-label={`Chat model for ${workspace.name}`}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-[28rem]"
                  defaultValue={override?.modelId ?? "fallback"}
                  name="modelId"
                >
                  <option value="fallback">Use global chat model</option>
                  {ALLOWED_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {MODEL_PRICES[model].label} · {model}
                    </option>
                  ))}
                </select>
                <Button size="sm" type="submit" variant="outline">
                  Save
                </Button>
              </form>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="changes-heading" className="space-y-3">
        <h2 className="text-lg font-semibold" id="changes-heading">
          Recent changes
        </h2>
        <ul className="divide-y rounded-md border text-sm">
          {data.changes.length > 0 ? (
            data.changes.map((change, index) => (
              <li
                className="flex flex-wrap justify-between gap-2 p-3"
                key={`${change.changedAt}-${index}`}
              >
                <span>
                  {change.feature} → {change.modelId ?? "global fallback"}
                  {change.orgId ? " · workspace override" : " · global"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {change.changedBy} · {change.changedAt.toLocaleString("en")}
                </span>
              </li>
            ))
          ) : (
            <li className="p-3 text-muted-foreground">No model changes recorded.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
