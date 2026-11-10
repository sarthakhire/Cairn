const { parseDate, pushChunks, IngestError } = require("./util");

// Expected file: { "issues": [...], "commits": [...] }
//   issue:  { number, title, body, state, user: {login} | author, created_at, updated_at,
//             html_url, comments: [ { user, body, created_at } ] }
//   commit: { sha, message, author, date }  or the raw API shape { sha, commit: { message, author: { name, date } } }
// A numeric "comments" field (the raw API only gives a count) is ignored.

const str = (v) => (v === null || v === undefined ? "" : String(v));
const who = (u) => {
  if (!u) return null;
  if (typeof u === "string") return u;
  return str(u.login || u.name) || null;
};
const day = (d) => (d ? d.toISOString().slice(0, 10) : "");
const latest = (dates) => dates.filter(Boolean).reduce((a, b) => (!a || b > a ? b : a), null);
const url = (v) => (typeof v === "string" && /^https?:\/\//.test(v) ? v : null);

function parseGithub(text, filename) {
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch (e) {
    throw new IngestError("The file is not valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new IngestError('Expected a JSON object like { "issues": [...], "commits": [...] }');
  }
  const issues = Array.isArray(data.issues) ? data.issues : [];
  const commits = Array.isArray(data.commits) ? data.commits : [];
  if (!issues.length && !commits.length) {
    throw new IngestError('No "issues" or "commits" found in the file');
  }

  const chunks = [];

  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const title = str(issue.title).trim();
    const body = str(issue.body).trim();
    if (!title && !body) continue;

    const created = parseDate(issue.created_at);
    const comments = (Array.isArray(issue.comments) ? issue.comments : []).filter(
      (c) => c && str(c.body).trim()
    );
    const author = who(issue.user || issue.author);

    const meta = [
      author && "Author: " + author,
      issue.state && "State: " + str(issue.state),
      created && "Created: " + day(created),
    ].filter(Boolean);

    const lines = ["Issue" + (issue.number != null ? " #" + issue.number : "") + ": " + title];
    if (meta.length) lines.push(meta.join(" | "));
    if (body) lines.push("", body);
    for (const c of comments) {
      const d = parseDate(c.created_at);
      lines.push("", "Comment by " + (who(c.user || c.author) || "unknown") + (d ? " (" + day(d) + ")" : "") + ": " + str(c.body).trim());
    }

    pushChunks(chunks, filename, lines.join("\n"), {
      author,
      timestamp: latest([parseDate(issue.updated_at), created, ...comments.map((c) => parseDate(c.created_at))]),
      link: url(issue.html_url) || url(issue.url),
    });
  }

  for (const c of commits) {
    if (!c || typeof c !== "object") continue;
    const message = str(c.message !== undefined ? c.message : c.commit && c.commit.message).trim();
    if (!message) continue;
    const author =
      who(c.author) || who(c.commit && c.commit.author) || who(c.committer) || null;
    const when = parseDate(c.date || (c.commit && c.commit.author && c.commit.author.date));
    const sha = str(c.sha).slice(0, 7);

    const lines = ["Commit" + (sha ? " " + sha : "") + ": " + message];
    const meta = [author && "Author: " + author, when && "Date: " + day(when)].filter(Boolean);
    if (meta.length) lines.push(meta.join(" | "));

    pushChunks(chunks, filename, lines.join("\n"), {
      author,
      timestamp: when,
      link: url(c.html_url),
    });
  }

  return chunks;
}

module.exports = { parseGithub };