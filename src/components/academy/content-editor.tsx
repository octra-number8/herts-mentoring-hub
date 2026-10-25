"use client";

import { useId, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, FormActions, SubmitButton } from "@/components/ui/form";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { BLOCK_LABELS, BLOCK_TYPES, scenarioProblems, videoEmbed, type Block, type BlockType, type Scenario } from "@/server/academy/content";

type Action = (p: ActionState, f: FormData) => Promise<ActionState>;
type Keyed = { key: number; block: Block };

const control = "block w-full rounded-md border border-line bg-white px-3 py-2 text-[15px] text-ink focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100";

function Labelled({ label, children, hint }: { label: string; children: (id: string) => React.ReactNode; hint?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {children(id)}
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

function newBlock(type: BlockType): Block {
  switch (type) {
    case "text": return { type, markdown: "" };
    case "callout": return { type, text: "", tone: "info" };
    case "image": return { type, path: "", alt: "" };
    case "video": return { type, url: "", title: "" };
    case "principles": return { type };
    case "resource": return { type, title: "" };
  }
}

function Uploader({ lessonId, upload, accept, label, onDone }: { lessonId: string; upload: Action; accept: string; label: string; onDone: (path: string, url: string | null, name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  async function go() {
    const file = ref.current?.files?.[0];
    if (!file) { setError("Choose a file first."); return; }
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.set("lesson_id", lessonId);
    fd.set("file", file);
    const res = await upload(initialActionState, fd);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    const d = res.data as { path: string; url: string | null; name: string };
    onDone(d.path, d.url, d.name);
    if (ref.current) ref.current.value = "";
  }
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={id} ref={ref} type="file" accept={accept} className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:font-medium file:text-navy-800" />
        <button type="button" onClick={go} disabled={busy} className={buttonClass("secondary", "sm")}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
      {error && <p role="alert" className="text-[13px] font-medium text-danger-700">{error}</p>}
    </div>
  );
}

function BlockFields({ block, onChange, lessonId, upload, media, onMedia }: {
  block: Block; onChange: (b: Block) => void; lessonId: string; upload: Action; media: Record<string, string>; onMedia: (path: string, url: string) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <Labelled label="Text" hint="Markdown: ## for a heading, **bold**, - for a list, [link](https://...).">
          {(id) => <textarea id={id} rows={8} className={cn(control, "font-mono text-sm")} value={block.markdown} onChange={(e) => onChange({ ...block, markdown: e.target.value })} />}
        </Labelled>
      );
    case "callout":
      return (
        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Labelled label="Style">
            {(id) => (
              <select id={id} className={control} value={block.tone} onChange={(e) => onChange({ ...block, tone: e.target.value as "info" | "tip" | "important" })}>
                <option value="info">Note</option><option value="tip">Tip</option><option value="important">Important</option>
              </select>
            )}
          </Labelled>
          <Labelled label="Callout text">{(id) => <textarea id={id} rows={3} className={control} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />}</Labelled>
        </div>
      );
    case "image":
      return (
        <div className="space-y-3">
          {block.path && media[block.path] ? (
            // Signed URL from a private bucket.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media[block.path]} alt={block.alt} className="max-h-60 rounded-md border border-line" />
          ) : block.path ? <p className="text-sm text-muted">Image uploaded.</p> : null}
          <Uploader lessonId={lessonId} upload={upload} accept="image/png,image/jpeg,image/webp,image/gif" label={block.path ? "Replace image" : "Image file"}
            onDone={(path, url) => { onChange({ ...block, path }); if (url) onMedia(path, url); }} />
          <Labelled label="Alternative text" hint="Describe the image for people who cannot see it. Leave blank only if it is purely decorative.">
            {(id) => <input id={id} className={control} value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} />}
          </Labelled>
          <Labelled label="Caption (optional)">{(id) => <input id={id} className={control} value={block.caption ?? ""} onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })} />}</Labelled>
        </div>
      );
    case "video": {
      const v = block.url ? videoEmbed(block.url) : null;
      return (
        <div className="space-y-3">
          <Labelled label="Video title">{(id) => <input id={id} className={control} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />}</Labelled>
          <Labelled label="Video address" hint="A YouTube or Vimeo link, or an https address ending in .mp4.">
            {(id) => <input id={id} type="url" className={control} value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />}
          </Labelled>
          {block.url && <p className={cn("text-[13px]", v ? "text-success-700" : "text-warning-800")}>{v ? `Recognised: ${v.kind === "mp4" ? "MP4 video" : v.kind === "youtube" ? "YouTube" : "Vimeo"}` : "This address is not a supported video yet."}</p>}
        </div>
      );
    }
    case "principles":
      return (
        <Labelled label="Introduction (optional)" hint="Shows the four principles: Prepare · Guide · Support · Enlighten.">
          {(id) => <input id={id} className={control} value={block.intro ?? ""} onChange={(e) => onChange({ ...block, intro: e.target.value || undefined })} />}
        </Labelled>
      );
    case "resource":
      return (
        <div className="space-y-3">
          <Labelled label="Resource title">{(id) => <input id={id} className={control} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />}</Labelled>
          <Labelled label="Description (optional)">{(id) => <input id={id} className={control} value={block.description ?? ""} onChange={(e) => onChange({ ...block, description: e.target.value || undefined })} />}</Labelled>
          {block.path ? (
            <p className="text-sm text-slate-ink">File attached. <button type="button" className="font-medium text-navy-800 underline" onClick={() => onChange({ ...block, path: undefined })}>Use a link instead</button></p>
          ) : (
            <>
              <Labelled label="Link" hint="An https address, for example a Solomon page. Or upload a file below.">
                {(id) => <input id={id} type="url" className={control} value={block.url ?? ""} onChange={(e) => onChange({ ...block, url: e.target.value || undefined })} />}
              </Labelled>
              <Uploader lessonId={lessonId} upload={upload} accept="application/pdf,image/*,.docx,.pptx" label="Or upload a file"
                onDone={(path, url, name) => { onChange({ ...block, path, url: undefined, title: block.title || name }); if (url) onMedia(path, url); }} />
            </>
          )}
        </div>
      );
  }
}

function ScenarioEditor({ scenario, onChange }: { scenario: Scenario; onChange: (s: Scenario) => void }) {
  const ids = Object.keys(scenario.nodes);
  const problems = scenarioProblems(scenario);
  const setNode = (id: string, node: Scenario["nodes"][string]) => onChange({ ...scenario, nodes: { ...scenario.nodes, [id]: node } });
  function addNode() {
    let n = ids.length + 1;
    while (scenario.nodes[`step-${n}`]) n++;
    onChange({ ...scenario, nodes: { ...scenario.nodes, [`step-${n}`]: { text: "", choices: [] } } });
  }
  function removeNode(id: string) {
    const rest = { ...scenario.nodes };
    delete rest[id];
    onChange({ start: scenario.start === id ? Object.keys(rest)[0] ?? "" : scenario.start, nodes: rest });
  }
  return (
    <section aria-labelledby="scenario-h" className="space-y-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="scenario-h" className="text-[15px] font-semibold text-navy-900">Scenario steps</h2>
          <p className="text-sm text-muted">Each step has text and choices. A step with no choices ends the scenario.</p>
        </div>
        <Labelled label="Starts at">
          {(id) => <select id={id} className={cn(control, "w-48")} value={scenario.start} onChange={(e) => onChange({ ...scenario, start: e.target.value })}>{ids.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
        </Labelled>
      </div>
      {problems.length > 0 && (
        <div role="status" className="rounded-md border border-warning-800/20 bg-warning-50 px-4 py-2.5 text-sm text-warning-800">
          <p className="font-medium">To check before review:</p>
          <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <ol className="space-y-4">
        {ids.map((id) => {
          const node = scenario.nodes[id]!;
          return (
            <li key={id} className="rounded-lg border border-line p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy-900">Step <code className="rounded bg-canvas px-1">{id}</code>{scenario.start === id && <span className="ml-2 text-teal-800">(start)</span>}</p>
                {ids.length > 1 && <button type="button" className={buttonClass("subtle", "sm")} onClick={() => removeNode(id)}>Remove step<span className="sr-only"> {id}</span></button>}
              </div>
              <Labelled label="What happens">{(fid) => <textarea id={fid} rows={3} className={control} value={node.text} onChange={(e) => setNode(id, { ...node, text: e.target.value })} />}</Labelled>
              <div className="mt-3 space-y-3">
                {node.choices.map((c, ci) => (
                  <fieldset key={ci} className="grid gap-2 rounded-md bg-canvas p-3 sm:grid-cols-[minmax(0,2fr)_10rem]">
                    <legend className="sr-only">Choice {ci + 1} of step {id}</legend>
                    <Labelled label={`Choice ${ci + 1}`}>{(fid) => <input id={fid} className={control} value={c.label} onChange={(e) => setNode(id, { ...node, choices: node.choices.map((x, xi) => (xi === ci ? { ...x, label: e.target.value } : x)) })} />}</Labelled>
                    <Labelled label="Leads to">{(fid) => (
                      <select id={fid} className={control} value={c.next} onChange={(e) => setNode(id, { ...node, choices: node.choices.map((x, xi) => (xi === ci ? { ...x, next: e.target.value } : x)) })}>
                        {!ids.includes(c.next) && <option value={c.next}>{c.next || "Choose"} (missing)</option>}
                        {ids.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    )}</Labelled>
                    <div className="sm:col-span-2">
                      <Labelled label="Feedback shown after this choice">{(fid) => <input id={fid} className={control} value={c.feedback ?? ""} onChange={(e) => setNode(id, { ...node, choices: node.choices.map((x, xi) => (xi === ci ? { ...x, feedback: e.target.value || undefined } : x)) })} />}</Labelled>
                    </div>
                    <div className="sm:col-span-2"><button type="button" className={buttonClass("subtle", "sm")} onClick={() => setNode(id, { ...node, choices: node.choices.filter((_, xi) => xi !== ci) })}>Remove choice</button></div>
                  </fieldset>
                ))}
                <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setNode(id, { ...node, choices: [...node.choices, { label: "", next: ids.find((n) => n !== id) ?? id }] })}>Add choice</button>
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={addNode}>Add step</button>
    </section>
  );
}

/** Edits a lesson's blocks (and scenario or reflection prompt) and saves them together. */
export function ContentEditor({ lessonId, kind, initial, media: initialMedia, save, upload }: {
  lessonId: string; kind: string; initial: { blocks: Block[]; scenario?: Scenario; prompt?: string }; media: Record<string, string>; save: Action; upload: Action;
}) {
  const counter = useRef(initial.blocks.length);
  const [items, setItems] = useState<Keyed[]>(() => initial.blocks.map((block, key) => ({ key, block })));
  const [scenario, setScenario] = useState<Scenario>(initial.scenario ?? { start: "start", nodes: { start: { text: "", choices: [] } } });
  const [prompt, setPrompt] = useState(initial.prompt ?? "");
  const [media, setMedia] = useState(initialMedia);
  const [adding, setAdding] = useState<BlockType>("text");
  const promptId = useId();
  const addId = useId();

  const update = (key: number, block: Block) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, block } : x)));
  const move = (i: number, d: -1 | 1) => setItems((xs) => {
    const ys = [...xs];
    const j = i + d;
    if (j < 0 || j >= ys.length) return xs;
    [ys[i], ys[j]] = [ys[j]!, ys[i]!];
    return ys;
  });
  const content = JSON.stringify({
    blocks: items.map((x) => x.block),
    ...(kind === "scenario" ? { scenario } : {}),
    ...(kind === "reflection" && prompt.trim() ? { prompt: prompt.trim() } : {}),
  });

  return (
    <ActionForm action={save} className="space-y-6">
      <input type="hidden" name="lesson_id" value={lessonId} />
      <input type="hidden" name="content" value={content} />
      <section aria-labelledby="blocks-h" className="space-y-4">
        <h2 id="blocks-h" className="text-[15px] font-semibold text-navy-900">Content blocks</h2>
        {items.length === 0 && <p className="rounded-md border border-dashed border-line px-4 py-5 text-sm text-muted">No content yet. Add a block below.</p>}
        <ol className="space-y-4">
          {items.map((x, i) => (
            <li key={x.key} className="rounded-xl border border-line bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy-900">{i + 1}. {BLOCK_LABELS[x.block.type]}</p>
                <div className="flex gap-1">
                  <button type="button" className={buttonClass("subtle", "sm")} onClick={() => move(i, -1)} disabled={i === 0}>Move up<span className="sr-only"> block {i + 1}</span></button>
                  <button type="button" className={buttonClass("subtle", "sm")} onClick={() => move(i, 1)} disabled={i === items.length - 1}>Move down<span className="sr-only"> block {i + 1}</span></button>
                  <button type="button" className={buttonClass("subtle", "sm")} onClick={() => setItems((xs) => xs.filter((y) => y.key !== x.key))}>Remove<span className="sr-only"> block {i + 1}</span></button>
                </div>
              </div>
              <BlockFields block={x.block} onChange={(b) => update(x.key, b)} lessonId={lessonId} upload={upload} media={media} onMedia={(p, u) => setMedia((m) => ({ ...m, [p]: u }))} />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
          <div className="space-y-1">
            <label htmlFor={addId} className="block text-sm font-medium text-ink">Add a block</label>
            <select id={addId} className={cn(control, "w-56")} value={adding} onChange={(e) => setAdding(e.target.value as BlockType)}>
              {BLOCK_TYPES.map((t) => <option key={t} value={t}>{BLOCK_LABELS[t]}</option>)}
            </select>
          </div>
          <button type="button" className={buttonClass("secondary")} onClick={() => { setItems((xs) => [...xs, { key: ++counter.current, block: newBlock(adding) }]); }}>Add</button>
        </div>
      </section>

      {kind === "reflection" && (
        <div className="space-y-1 rounded-xl border border-line bg-white p-4">
          <label htmlFor={promptId} className="block text-sm font-medium text-ink">Reflection question</label>
          <input id={promptId} className={control} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. What made you feel welcome when you were new?" />
          <p className="text-[13px] text-muted">Shown above the learner&apos;s private answer box.</p>
        </div>
      )}
      {kind === "scenario" && <ScenarioEditor scenario={scenario} onChange={setScenario} />}

      <FormActions><SubmitButton>Save content</SubmitButton></FormActions>
    </ActionForm>
  );
}
