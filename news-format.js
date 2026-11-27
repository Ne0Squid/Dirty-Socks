// Turns a news post (a small, safe Markdown) into HTML. Used by the home page for posts and for the editor preview.
// Everything the author types is escaped first; only the tags below can ever appear. Links must be http(s); pictures must be
// uploaded ones (img:ID). Supported: # ## ### headings, **bold**, *italic* / _italic_, ~~strike~~, `code`, > quote, - and 1. lists,
// --- rule, [text](https://link), bare https:// links, ![caption](img:ID).
(function (root, make) {
  var api = make();
  if (typeof module === "object" && module.exports) module.exports = api; else root.NewsFmt = api;
})(this, function () {
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var ID = "[a-z0-9]{6,40}";

  function imgHtml(alt, id, base, block) {
    var src = esc(String(base || "").replace(/\/+$/, "") + "/api/news/img/" + id);
    var tag = '<a class="nimg" href="' + src + '" target="_blank" rel="noopener"><img src="' + src + '" alt="' + esc(alt || "Picture from this news post") + '" loading="lazy" decoding="async"></a>';
    return block ? '<figure class="nfig">' + tag + (alt ? "<figcaption>" + esc(alt) + "</figcaption>" : "") + "</figure>" : tag;
  }

  // One run of text (no line breaks between blocks). Pieces that must not be touched again are parked behind \u0000N\u0000 markers.
  function inline(src, base) {
    var held = [], raw = [], kind = [];   // parked HTML, the plain text it stands for, and what it is
    function hold(html, k, plain) { held.push(html); kind.push(k); raw.push(plain || ""); return "\u0000" + (held.length - 1) + "\u0000"; }
    // Parked pieces cannot go inside an attribute or inside another picture: swap code spans back to their text, drop pictures.
    function flat(t) { return t.replace(/\u0000(\d+)\u0000/g, function (m, i) { return kind[+i] === "code" ? raw[+i] : ""; }); }
    function emph(t) {   // t is already escaped
      return t
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, "<strong>$1</strong>")
        .replace(/~~(?=\S)([^\n]*?\S)~~/g, "<s>$1</s>")
        .replace(/(^|[^*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, "$1<em>$2</em>");
    }
    var s = String(src)
      .replace(/`([^`\n]+)`/g, function (m, c) { return hold("<code>" + esc(c) + "</code>", "code", c); })
      .replace(new RegExp("!\\[([^\\]\\n]*)\\]\\(img:(" + ID + ")\\)", "g"), function (m, alt, id) { return hold(imgHtml(flat(alt), id, base, false), "img"); })
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s()<>"'`]+)\)/g, function (m, t, u) {
        return hold('<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow">' + emph(esc(t.replace(/\u0000(\d+)\u0000/g, function (x, i) { return kind[+i] === "img" ? "" : x; }))) + "</a>", "a");
      })
      .replace(/(^|[\s(])(https?:\/\/[^\s<>"'`\u0000]+)/g, function (m, pre, u) {
        var tail = (u.match(/[.,;:!?)\]]+$/) || [""])[0];   // keep sentence punctuation out of the link
        if (tail) u = u.slice(0, -tail.length);
        return pre + hold('<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(u) + "</a>", "a") + tail;
      });
    s = emph(esc(s));
    for (var n = 0; n < 4 && /\u0000\d+\u0000/.test(s); n++) s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return held[+i] || ""; });
    return s.replace(/\u0000/g, "");
  }

  function render(src, base) {
    var L = String(src == null ? "" : src).replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n"), out = [], i = 0, m;
    var special = /^\s*(#{1,3}\s|>|[-*+]\s+\S|\d+[.)]\s+\S|(-{3,}|\*{3,}|_{3,})\s*$|!\[[^\]\n]*\]\(img:[a-z0-9]{6,40}\)\s*$)/;
    while (i < L.length) {
      var l = L[i];
      if (!l.trim()) { i++; continue; }
      if ((m = l.match(/^\s*(#{1,3})\s+(.*)$/))) { out.push('<h4 class="nh nh' + m[1].length + '">' + inline(m[2].trim(), base) + "</h4>"); i++; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if ((m = l.match(new RegExp("^\\s*!\\[([^\\]\\n]*)\\]\\(img:(" + ID + ")\\)\\s*$")))) { out.push(imgHtml(m[1].trim(), m[2], base, true)); i++; continue; }
      if (/^\s*>/.test(l)) {
        var q = [];
        while (i < L.length && /^\s*>/.test(L[i])) { q.push(inline(L[i].replace(/^\s*>\s?/, ""), base)); i++; }
        out.push("<blockquote>" + q.join("<br>") + "</blockquote>"); continue;
      }
      if (/^\s*[-*+]\s+\S/.test(l)) {
        var ul = [];
        while (i < L.length && /^\s*[-*+]\s+\S/.test(L[i])) { ul.push("<li>" + inline(L[i].replace(/^\s*[-*+]\s+/, ""), base) + "</li>"); i++; }
        out.push("<ul>" + ul.join("") + "</ul>"); continue;
      }
      if (/^\s*\d+[.)]\s+\S/.test(l)) {
        var ol = [];
        while (i < L.length && /^\s*\d+[.)]\s+\S/.test(L[i])) { ol.push("<li>" + inline(L[i].replace(/^\s*\d+[.)]\s+/, ""), base) + "</li>"); i++; }
        out.push("<ol>" + ol.join("") + "</ol>"); continue;
      }
      var p = [];
      while (i < L.length && L[i].trim() && (p.length === 0 || !special.test(L[i]))) { p.push(inline(L[i].trim(), base)); i++; }
      out.push("<p>" + p.join("<br>") + "</p>");
    }
    return out.join("");
  }
  return { render: render, esc: esc };
});
