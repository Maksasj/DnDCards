// Minimal markdown for card text: paragraphs, "- " lists, "| a | b |" tables,
// ***bold italic***, **bold**, *italic*.

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline(text) {
  return escape(text)
    .replace(/\s\[[a-z][^\]]*\]/gi, '') // drop English cross-refs like "снятие проклятия [remove curse]"
    // dnd.su nests bold/italic around headings in several ways ("***Комета*.**Если …");
    // normalize to "***Комета.*** Если"
    .replace(/\*\*\*([^*]+?)\*([.:])\*\*/g, '***$1$2***')
    .replace(/\*\*\*([^*]+?[.:])\*\*\*(?=[^\s*])/g, '***$1*** ')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>');
}

export function markdown(text = '') {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => l.startsWith('- '))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
      }
      if (lines.every((l) => l.startsWith('|'))) {
        const rows = lines.map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
        const [head, ...body] = rows;
        return `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      // Lines inside one block were <br>-separated on dnd.su: one paragraph per line, so that
      // long blocks can be split between cards.
      if (lines.length > 1) return lines.map((l) => `<p class="line">${inline(l)}</p>`).join('');
      return `<p>${inline(block)}</p>`;
    })
    .join('');
}
