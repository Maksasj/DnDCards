import { inline, markdown } from '../markdown.js';

// Class features, their options (Тотемный дух → Медведь), option-list entries (invocations,
// maneuvers, infusions) and feats. Entries are flattened by flattenClasses() / the feats loader.

const star = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;

const sources = (e) => (e.sources ?? []).map((x) => x.code).join(' ');

function card({ id, kind, box, spine, name, nameEn, subtitle, body, e }) {
  return `
  <article class="card ${kind}" data-id="${id}">
    <aside class="spine">
      ${box}
      <span class="school">${inline(spine)}</span>
    </aside>
    <div class="face">
      <header>
        <h2 class="name">${inline(name)}</h2>
        ${nameEn ? `<div class="name-en">${inline(nameEn)}</div>` : ''}
        ${subtitle ? `<div class="subtitle">${inline(subtitle)}</div>` : ''}
      </header>
      <div class="body">${body}</div>
      <footer>
        <span class="classes"></span>
        <span class="sources">${sources(e)}</span>
      </footer>
    </div>
  </article>`;
}

export function featureCard(e) {
  const level = e.level ? `<span class="level">${e.level}</span>` : '';
  const spine = [e.className, e.sectionName].filter(Boolean).join(' · ').toLowerCase();
  const subtitle = e.optionOf
    ? `${e.optionOf}${e.subtitle ? ` · ${e.subtitle}` : ''}`
    : e.prerequisite ? `Требование: ${e.prerequisite}` : e.subtitle;
  return card({
    id: `class-${e.id}`, kind: 'feature', box: level, spine, name: e.name, subtitle, e,
    body: markdown(e.description),
  });
}

export function featCard(f) {
  return card({
    id: `feat-${f.id}`, kind: 'feat', box: `<span class="level icon-box">${star}</span>`, spine: 'черта',
    name: f.name, nameEn: f.name_en, subtitle: f.prerequisite ? `Требование: ${f.prerequisite}` : '', e: f,
    body: markdown(f.description),
  });
}

export const FEAT_ICON = star;

// data/classes/*.yaml → one flat list of pickable entries, in page order:
// class features (each followed by its options), option lists, then each subclass.
export function flattenClasses(classes) {
  const out = [];
  for (const c of classes) {
    const base = { classId: c.id, className: c.name, sources: c.sources };
    const addFeature = (f, extra) => {
      out.push({ ...base, ...extra, ...f, options: undefined });
      for (const o of f.options ?? []) {
        out.push({ ...base, ...extra, ...o, level: f.level, subtitle: f.subtitle, optionOf: f.name });
      }
    };
    for (const f of c.features) addFeature(f, { group: c.id, groupName: c.name });
    for (const l of c.lists) {
      for (const e of l.entries) {
        out.push({ ...base, ...e, group: l.id, groupName: `${c.name} — ${l.name}`, sectionName: l.name });
      }
    }
    for (const s of c.subclasses) {
      const extra = { group: s.id, groupName: `${c.name} — ${s.name}`, subclassId: s.id, sectionName: s.name, sources: s.sources };
      for (const f of s.features) addFeature(f, extra);
    }
  }
  return out;
}
