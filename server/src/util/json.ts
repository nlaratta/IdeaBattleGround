export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  // Fast path
  try {
    return JSON.parse(trimmed) as T;
  } catch { /* fall through */ }

  // Strip code fences
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try { return JSON.parse(fence[1].trim()) as T; } catch { /* fall through */ }
  }

  // Find first balanced JSON object/array
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== '{' && ch !== '[') continue;
    const open = ch;
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < trimmed.length; j++) {
      const c = trimmed[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          const slice = trimmed.slice(i, j + 1);
          try { return JSON.parse(slice) as T; } catch { break; }
        }
      }
    }
  }

  throw new Error('Could not extract JSON from model output');
}
