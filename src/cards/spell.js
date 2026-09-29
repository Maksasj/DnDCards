import { SCHOOL_ICONS } from './school-icons.js';
import { inline, markdown } from '../markdown.js';

const shorten = (s = '') =>
  s
    .replace(/Концентрация, вплоть до/i, 'до')
    .replace(/бонусное действие/i, 'бонусное')
    .replace(/(\d+) футов/g, '$1 фт')
    .replace(/(\d+)-футов\S*/g, '$1-фт');

export function spellCard(s) {

  return `
  <article class="card spell" data-id="${s.id}">
    <aside class="spine">
      <span class="level">${s.level}</span>
      <span class="glyph">${SCHOOL_ICONS[s.school] ?? ''}</span>
      <span class="school">${s.level === 0 ? 'заговор · ' : ''}${s.school}</span>
    </aside>
    <div class="face">
      <header>
        <h2 class="name">${inline(s.name)}</h2>
        <div class="name-en">${inline(s.name_en ?? '')}</div>
      </header>
      <dl class="stats">
        <div><dt>время</dt><dd>${inline(shorten(s.casting_time))}${s.ritual ? '<span class="tag">ритуал</span>' : ''}</dd></div>
        <div><dt>дистанция</dt><dd>${inline(shorten(s.range))}</dd></div>
        <div><dt>компоненты</dt><dd>${inline(s.components ?? '')}</dd></div>
        <div><dt>длительность</dt><dd>${inline(shorten(s.duration))}${s.concentration ? '<span class="tag">концентрация</span>' : ''}</dd></div>
      </dl>
      <div class="body">
        ${s.reaction_trigger ? `<p class="trigger">Реакция: ${inline(s.reaction_trigger)}</p>` : ''}
        ${s.material ? `<p class="material">${inline(s.material)}</p>` : ''}
        ${markdown(s.description)}
        ${s.higher_levels ? `<p class="higher"><b><i>На больших уровнях.</i></b> ${inline(s.higher_levels)}</p>` : ''}
      </div>
      <footer>
        <span class="classes">${(s.classes ?? []).join(', ')}</span>
        <span class="sources">${(s.sources ?? []).map((x) => x.code).join(' ')}</span>
      </footer>
    </div>
  </article>`;
}
