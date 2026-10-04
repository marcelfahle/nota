// Linear-time scanning of untrusted HTML. Anyone can point the reader at a
// page built to make a backtracking regex crawl, so the passes that walk a
// whole document use indexOf instead of open-ended patterns.

const MAX_TAG_LENGTH = 4000;

/** Opening tags named `name`, as written. Unterminated or oversized tags are skipped. */
export function openTags(html: string, name: string, limit = 500) {
  const lower = html.toLowerCase();
  const needle = `<${name}`;
  const found: Array<string> = [];
  let from = 0;
  while (found.length < limit) {
    const start = lower.indexOf(needle, from);
    if (start < 0) {
      break;
    }
    from = start + needle.length;
    // "<a" must not match "<article".
    if (/[\w-]/.test(lower[from] ?? "")) {
      continue;
    }
    const end = html.indexOf(">", from);
    if (end < 0) {
      break;
    }
    if (end - start <= MAX_TAG_LENGTH) {
      found.push(html.slice(start, end + 1));
    }
    from = end + 1;
  }
  return found;
}

/** `<name ...>inner</name>` blocks. An element that never closes ends the scan. */
export function elementBlocks(html: string, name: string, limit = 300) {
  const lower = html.toLowerCase();
  const open = `<${name}`;
  const close = `</${name}`;
  const found: Array<{ inner: string; tag: string }> = [];
  let from = 0;
  while (found.length < limit) {
    const start = lower.indexOf(open, from);
    if (start < 0) {
      break;
    }
    from = start + open.length;
    if (/[\w-]/.test(lower[from] ?? "")) {
      continue;
    }
    const tagEnd = html.indexOf(">", from);
    if (tagEnd < 0) {
      break;
    }
    const end = lower.indexOf(close, tagEnd + 1);
    if (end < 0) {
      break;
    }
    if (tagEnd - start <= MAX_TAG_LENGTH) {
      found.push({ inner: html.slice(tagEnd + 1, end), tag: html.slice(start, tagEnd + 1) });
    }
    from = end + close.length;
  }
  return found;
}

/** The document without the named elements and everything inside them. */
export function stripElements(html: string, names: Array<string>) {
  let result = html;
  for (const name of names) {
    const lower = result.toLowerCase();
    const open = `<${name}`;
    const close = `</${name}`;
    const kept: Array<string> = [];
    let from = 0;
    for (;;) {
      const start = lower.indexOf(open, from);
      if (start < 0) {
        kept.push(result.slice(from));
        break;
      }
      kept.push(result.slice(from, start));
      const end = lower.indexOf(close, start);
      const after = end < 0 ? -1 : result.indexOf(">", end);
      if (after < 0) {
        // Unclosed: drop the rest rather than read script source as text.
        break;
      }
      from = after + 1;
    }
    result = kept.join(" ");
  }
  return result;
}

/** Text with every tag removed and whitespace collapsed. */
export function visibleText(html: string) {
  const source = stripElements(html, ["script", "style", "noscript", "svg"]);
  const parts: Array<string> = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf("<", from);
    if (start < 0) {
      parts.push(source.slice(from));
      break;
    }
    parts.push(source.slice(from, start));
    const end = source.indexOf(">", start);
    if (end < 0) {
      break;
    }
    from = end + 1;
  }
  return parts.join(" ").replaceAll(/\s+/g, " ").trim();
}

/** Values of inline `style="..."` attributes. */
export function inlineStyles(html: string, limit = 400) {
  const lower = html.toLowerCase();
  const found: Array<string> = [];
  let from = 0;
  while (found.length < limit) {
    const start = lower.indexOf('style="', from);
    if (start < 0) {
      break;
    }
    const end = html.indexOf('"', start + 7);
    if (end < 0) {
      break;
    }
    if (end - start <= MAX_TAG_LENGTH) {
      found.push(html.slice(start + 7, end));
    }
    from = end + 1;
  }
  return found;
}
