/* part:page.script.files */
/* The kit files, read by path. window.CatalogFiles is the one place the page and its previews read a kit file's header
   from: text, json, load (a css or js file into the page, once), header (the header comment of a kit file, which is the
   only description of an entry beyond the index) and main (which file of an entry carries that header). It reads and
   writes nothing else: no file is published or changed from here. It does not need catalog.js. */
(function () {
'use strict';
const norm = p => String(p || '').replace(/^\.\//, '').replace(/[?#].*$/, '');

// ---------------------------------------------------------------- reads, by path
const texts = {};
function text(path) {
  path = norm(path);
  if (texts[path]) return texts[path];
  const p = fetch(path).then(r => { if (!r.ok) throw new Error(path + ': HTTP ' + r.status); return r.text(); });
  texts[path] = p; p.catch(() => { delete texts[path]; });
  return p;
}
const json = path => text(path).then(t => JSON.parse(t));

// ---------------------------------------------------------------- load: a css or js file into the page, once
const loaded = {};
function load(path) {
  path = norm(path);
  if (loaded[path]) return loaded[path];
  const css = /\.css$/.test(path);
  if (!css && !/\.js$/.test(path)) return Promise.reject(new Error(path + ': load takes a .css or a .js file'));
  const p = new Promise((res, rej) => {
    const el = document.createElement(css ? 'link' : 'script');
    if (css) { el.rel = 'stylesheet'; el.href = path; } else { el.src = path; el.async = false; }
    el.onload = () => res(el); el.onerror = () => { el.remove(); rej(new Error('could not load ' + path)); };
    document.head.append(el);
  });
  loaded[path] = p; p.catch(() => { delete loaded[path]; });
  return p;
}

// ---------------------------------------------------------------- main: which file of an entry carries its header
const main = entry => (entry && entry.main) || '';       // the index record says; '' for a record that does not

// ---------------------------------------------------------------- header: the description a kit file carries
// The same reading as adp_index.py parse_header: what one accepts, cuts and names, the other does too.
const HEAD = 20000;                                      // the header comment, opening mark to closing mark, is in the first HEAD characters of its file
const LISTS = ['tags', 'requires', 'files', 'provides', 'globals', 'related', 'optional'];    // one line, items after commas
const MANY = ['config', 'source', 'changed'];            // repeatable: one line per value
const none = v => /^(none)?$/i.test(v.trim());
// the pieces of v between separators, trimmed. A separator after a backslash is that character, not a cut
function cut(v, sep) {
  const out = [''];
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '\\' && v[i + 1] === sep) { out[out.length - 1] += sep; i++; }
    else if (v[i] === sep) out.push('');
    else out[out.length - 1] += v[i];
  }
  return out.map(x => x.trim());
}
// a list tag: `a, b, c`; `\,` is a comma inside an item
const csv = v => none(v) ? [] : cut(v, ',').filter(Boolean);
// @config: `signature | what it takes`, cut at the first ` | ` (a bar with a space on each side and no backslash before it);
// `\|` is a bar inside the signature
function pair(v) {
  const bar = '\\|', m = /\s\|\s/.exec(v), i = m ? m.index + 1 : -1;
  return (i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)]).map(x => x.split(bar).join('|').trim());
}
// @db: `none`, or sections with ` / ` between them, each led by its keyword in lowercase and a space:
// `reads a; b / writes c; d / note free text`. The keyword is not part of what is returned. A section that starts
// with none of the three is an error in the header: it is not read, and is listed under `unread`, a key that is there only then
function dbOf(v) {
  const out = { reads: [], writes: [], note: '' }, notes = [], unread = [];
  if (none(v)) return out;
  for (const part of v.split(/\s+\/\s+/).map(x => x.trim()).filter(Boolean)) {
    const m = /^(reads|writes|note)\s+([\s\S]*)$/.exec(part);
    if (!m) unread.push(part);
    else if (m[1] === 'note') notes.push(m[2].trim());
    else out[m[1]] = out[m[1]].concat(m[2].split(';').map(x => x.trim()).filter(Boolean));
  }
  out.note = notes.join(' ');
  if (unread.length) out.unread = unread;
  return out;
}
// @source: `board | file | what`; `\|` is a bar inside a piece, and a bar after the second cut stays in what
function sourceOf(v) { const a = cut(v, '|'); return { board: a[0] || '', file: a[1] || '', what: a.slice(2).join(' | ') }; }
// the text of each tag -> the shapes the page reads: the list tags as lists, @tokens as a list cut at spaces (an optional token keeps its `?`),
// config [[signature, what]], source [{board, file, what}], changed [text], db {reads, writes, note}, preview the parsed
// JSON (null when it is not JSON); every other tag (@fonts and @extends too) is its text, '' for `none`
function shape(raw) {
  const h = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'name' || k === 'about') h[k] = v;
    else if (LISTS.includes(k)) h[k] = csv(v);
    else if (k === 'tokens') h[k] = none(v) ? [] : v.split(/\s+/).filter(Boolean);
    else if (k === 'config') h[k] = v.filter(x => !none(x)).map(pair);
    else if (k === 'source') h[k] = v.filter(x => !none(x)).map(sourceOf);
    else if (k === 'changed') h[k] = v.filter(x => !none(x));
    else if (k === 'db') h[k] = dbOf(v);
    else if (k === 'preview') { if (!none(v)) { try { h[k] = JSON.parse(v); } catch (_) { h[k] = null; } } }
    else h[k] = none(v) ? '' : v;
  }
  return h;
}
// the lines of the header comment, null without one. A .js or .css file (or its .txt copy): its first doc comment.
// A .md, .html.txt or other .txt file: its first html comment (text may come before it). No other file has one.
// `*\/` in either reads as the two characters that would end a doc comment
function commentOf(path, t) {
  const head = t.slice(0, HEAD), code = /\.(js|css)(\.txt)?$/i.test(path);
  if (!code && !/\.(md|txt)$/i.test(path)) return null;
  const m = (code ? /\/\*\*([\s\S]*?)\*\// : /<!--([\s\S]*?)-->/).exec(head);
  return m ? m[1].split('\n').map(l => (code ? l.replace(/^\s*\*( |$)/, '') : l).replace(/\*\\\//g, '*/')) : null;
}
// {} when the file has no header. Line 1 is the name; the first paragraph after it is the about, as one line: a blank
// line or a tag ends it. What follows before the tags is notes for people, not read. Then one tag per line, `@tag value`;
// a line between tags that is not a tag is not read. A repeatable tag gives a list, any other tag keeps its last line
function parseHeader(path, t) {
  const lines = commentOf(path, t); if (!lines) return {};
  const raw = {}, about = []; let name = null, inAbout = true;
  for (const line of lines) {
    const l = line.trim(), m = /^@([a-z][\w-]*)(?:[ \t\n\r\f\v]+(.*))?$/.exec(l);
    if (m) { inAbout = false; const k = m[1], v = (m[2] || '').trim(); if (MANY.includes(k)) (raw[k] = raw[k] || []).push(v); else raw[k] = v; }
    else if (name == null) name = l || null;
    else if (!l) inAbout = inAbout && !about.length;
    else if (inAbout) about.push(l);
  }
  if (name == null && !Object.keys(raw).length) return {};
  raw.name = name || ''; raw.about = about.join(' ');
  return shape(raw);
}
const header = path => text(path).then(t => parseHeader(path, t));

window.CatalogFiles = Object.freeze({ text, json, load, header, main });
})();
/* /part:page.script.files */
