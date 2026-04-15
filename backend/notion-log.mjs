// backend/notion-log.mjs
// Node 20+ (fetch native)

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!NOTION_TOKEN || !DATABASE_ID) {
  console.error("❌ NOTION_TOKEN / NOTION_DATABASE_ID missing");
  process.exit(1);
}

const notionFetch = async (method, url, body) => {
  const res = await fetch(`https://api.notion.com/v1/${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
};

// =========================
// HELPERS
// =========================
// =========================
// HELPERS
// =========================
function paragraph(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [
        {
          type: "text",
          text: { content: text },
        },
      ],
    },
  };
}

function tableRow(cells) {
  return {
    type: "table_row",
    table_row: {
      cells: cells.map((content) => [
        { type: "text", text: { content: String(content || "") } },
      ]),
    },
  };
}

function createCommitsTable(commits) {
  if (!commits || commits.length === 0) return null;

  return {
    object: "block",
    type: "table",
    table: {
      table_width: 5,
      has_column_header: true,
      children: [
        tableRow(["SHA", "Author", "Date", "Message", "Branch"]),
        ...commits.map((c) =>
          tableRow([
            c.sha?.substring(0, 7) || "-",
            c.author || "-",
            c.date || "-",
            c.message || "-",
            c.branch || "-",
          ])
        ),
      ],
    },
  };
}

// =========================
// CREATE PARENT RUN PAGE
// =========================
export async function createRun(data) {
  const body = {
    parent: { database_id: DATABASE_ID },
    properties: {
      workflow: { title: [{ text: { content: data.workflow } }] },
      sha: { rich_text: [{ text: { content: data.sha || "" } }] },
      message: { rich_text: [{ text: { content: data.message || "" } }] },
      author: { rich_text: [{ text: { content: data.author || "" } }] },
      branch: { rich_text: [{ text: { content: data.branch || "" } }] },
      env: { select: { name: data.env || "dev" } },
      status: { status: { name: data.status || "RUNNING" } },
      stage: { select: { name: data.stage || "build" } },
      start: { date: { start: data.start } },
      ...(data.end && { end: { date: { start: data.end } } }),
      logsUrl: { url: data.logsUrl || "" },
    },
  };

  if (data.children && data.children.length > 0) {
    body.children = data.children;
  }

  const res = await notionFetch("POST", "pages", body);

  return res.id;
}

// =========================
// CREATE COMMIT SUBPAGE (Deprecated/Unused)
// =========================
export async function createCommitSubpage(parentPageId, commit) {
  await notionFetch("POST", "pages", {
    parent: { page_id: parentPageId },
    properties: {
      title: {
        title: [
          {
            text: { content: `${commit.branch} – ${commit.message}` },
          },
        ],
      },
    },
    children: [
      paragraph(`Message: ${commit.message}`),
      paragraph(`Author: ${commit.author}`),
      paragraph(`Branch: ${commit.branch}`),
      paragraph(`Datetime: ${commit.date}`),
      paragraph(`SHA: ${commit.sha}`),
    ],
  });
}

// =========================
// CREATE RUN WITH COMMITS
// =========================
export async function createRunWithCommits({
  workflow,
  branch,
  env,
  status,
  stage,
  start,
  logsUrl,
  author,
  message,
  commitsJson,
}) {
  let commits = [];
  try {
    commits = JSON.parse(commitsJson || "[]");
  } catch (err) {
    console.warn("Invalid COMMITS_JSON, defaulting to empty array");
  }

  const children = [];
  const tableBlock = createCommitsTable(commits);
  if (tableBlock) {
    children.push(tableBlock);
  }

  // Use first commit SHA or empty string
  const mainSha =
    commits.length > 0 ? commits[0].sha : "";

  const pageId = await createRun({
    workflow,
    branch,
    env,
    status,
    stage,
    start,
    logsUrl,
    author,
    message,
    sha: mainSha,
    children, // Pass table as children
  });

  return pageId;
}

// =========================
// UPDATE RUN
// =========================
export async function updateRun(pageId, updates) {
  const body = { properties: {} };

  if (updates.status) {
    body.properties.status = { status: { name: updates.status } };
  }

  if (updates.stage) {
    body.properties.stage = { select: { name: updates.stage } };
  }

  if (updates.end) {
    body.properties.end = { date: { start: updates.end } };
  }

  await notionFetch("PATCH", `pages/${pageId}`, body);
}