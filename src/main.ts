import { App, Plugin, MarkdownPostProcessorContext } from "obsidian";

// ── Types ────────────────────────────────────────────────────────────────────

interface InfoboxRow {
  header?: string;
  label?: string;
  value?: string;
}

interface InfoboxData {
  title?: string;
  image?: string;
  caption?: string;
  type?: string;
  rows: InfoboxRow[];
}

// ── Parser ───────────────────────────────────────────────────────────────────

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

function parseInfoboxYaml(source: string): InfoboxData {
  const lines = source.split("\n");
  const data: InfoboxData = { rows: [] };
  let inRows = false;
  let currentRow: InfoboxRow | null = null;

  for (const rawLine of lines) {
    if (rawLine.trim() === "") continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();

    if (!inRows) {
      if (line === "rows:") {
        inRows = true;
        continue;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = stripQuotes(line.slice(colonIdx + 1).trim());
      if (key === "title")   data.title   = value;
      if (key === "image")   data.image   = value;
      if (key === "caption") data.caption = value;
      if (key === "type")    data.type    = value;
    } else {
      // Back to top-level
      if (indent === 0 && !line.startsWith("-")) {
        inRows = false;
        continue;
      }

      if (line.startsWith("- ")) {
        if (currentRow !== null) data.rows.push(currentRow);
        currentRow = {};
        const rest = line.slice(2).trim();
        if (rest !== "") {
          const colonIdx = rest.indexOf(":");
          if (colonIdx !== -1) {
            const key = rest.slice(0, colonIdx).trim();
            const val = stripQuotes(rest.slice(colonIdx + 1).trim());
            if (key === "header") currentRow.header = val;
            if (key === "label")  currentRow.label  = val;
            if (key === "value")  currentRow.value  = val;
          }
        }
      } else if (currentRow !== null) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          const val = stripQuotes(line.slice(colonIdx + 1).trim());
          if (key === "header") currentRow.header = val;
          if (key === "label")  currentRow.label  = val;
          if (key === "value")  currentRow.value  = val;
        }
      }
    }
  }

  if (currentRow !== null) data.rows.push(currentRow);

  return data;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function renderInfobox(
  data: InfoboxData,
  el: HTMLElement,
  app: App,
  sourcePath: string
): void {
  const classes = ["infobox-container"];
  if (data.type) classes.push(`infobox--${data.type.toLowerCase()}`);
  const box = el.createEl("div", { cls: classes.join(" ") });

  if (data.title) {
    box.createEl("div", { cls: "infobox-title", text: data.title });
  }

  if (data.image) {
    const imageFile = app.metadataCache.getFirstLinkpathDest(data.image, sourcePath);
    if (imageFile) {
      const resourcePath = app.vault.getResourcePath(imageFile);
      const imgWrapper = box.createEl("div", { cls: "infobox-image-wrapper" });
      imgWrapper.createEl("img", {
        cls: "infobox-image",
        attr: { src: resourcePath, alt: data.caption ?? data.title ?? "" },
      });
      if (data.caption) {
        imgWrapper.createEl("div", { cls: "infobox-caption", text: data.caption });
      }
    } else {
      const missing = box.createEl("div", { cls: "infobox-image-missing" });
      missing.createEl("span", { text: `Image not found: ${data.image}` });
    }
  }

  if (data.rows.length > 0) {
    type Section = { header?: string; dataRows: InfoboxRow[] };
    const sections: Section[] = [];
    let current: Section = { dataRows: [] };

    for (const row of data.rows) {
      if (row.header !== undefined) {
        if (current.header !== undefined || current.dataRows.length > 0) {
          sections.push(current);
        }
        current = { header: row.header, dataRows: [] };
      } else {
        current.dataRows.push(row);
      }
    }
    sections.push(current);

    for (const section of sections) {
      if (section.header !== undefined) {
        box.createEl("div", { cls: "infobox-section-header", text: section.header });
      }
      if (section.dataRows.length > 0) {
        const table = box.createEl("table", { cls: "infobox-table" });
        const tbody = table.createEl("tbody");
        for (const row of section.dataRows) {
          if (row.label !== undefined || row.value !== undefined) {
            const tr = tbody.createEl("tr", { cls: "infobox-data-row" });
            tr.createEl("th", { cls: "infobox-label", text: row.label ?? "" });
            tr.createEl("td", { cls: "infobox-value", text: row.value ?? "" });
          }
        }
      }
    }
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export default class InfoboxPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerMarkdownCodeBlockProcessor(
      "infobox",
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        try {
          const data = parseInfoboxYaml(source);
          renderInfobox(data, el, this.app, ctx.sourcePath);
        } catch (err) {
          const errorEl = el.createEl("div", { cls: "infobox-error" });
          errorEl.createEl("strong", { text: "Infobox error: " });
          errorEl.createEl("span", { text: String(err) });
        }
      }
    );
  }

  onunload(): void {
    // Plugin base class handles deregistering the processor automatically
  }
}
