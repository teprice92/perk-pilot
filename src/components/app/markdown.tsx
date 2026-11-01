import { Fragment, type ReactNode } from "react";

/** Tiny, safe Markdown renderer (bold, italic, code, links, lists, headings). No raw HTML. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-muted px-1 text-[0.9em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">{label}</a>);
    } else out.push(<em key={k} className="text-fg-muted">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: string[] = [];
  let ordered = false;
  const flush = (k: number) => {
    if (!list.length) return;
    const items = list.map((l, i) => <li key={i}>{inline(l, `li${k}-${i}`)}</li>);
    blocks.push(ordered ? <ol key={`l${k}`} className="my-2 list-decimal space-y-1 pl-5">{items}</ol> : <ul key={`l${k}`} className="my-2 list-disc space-y-1 pl-5">{items}</ul>);
    list = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      if (list.length && ordered !== Boolean(ol)) flush(idx);
      ordered = Boolean(ol);
      list.push((ul ?? ol)![1]!);
      return;
    }
    flush(idx);
    if (!line.trim()) return;
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) blocks.push(<p key={idx} className="mt-3 font-semibold">{inline(h[2]!, `h${idx}`)}</p>);
    else blocks.push(<p key={idx} className="my-1.5">{inline(line, `p${idx}`)}</p>);
  });
  flush(lines.length);
  return <Fragment>{blocks}</Fragment>;
}
