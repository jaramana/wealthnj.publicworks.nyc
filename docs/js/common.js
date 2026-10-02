import { site } from "./site-config.js?v=20261002";
export { site };
// Shared formats and definitions. Map and table use the same units and labels.
export const $ = (id) => document.getElementById(id);
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const money = (v) =>
  v == null ? "Not available" : "$" + whole.format(v);
export const compact = (v) =>
  v == null
    ? "Not available"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(v);
export const percent = (v) =>
  v == null
    ? "Not available"
    : v > 0 && v < 0.001
      ? "<0.1%"
      : (v * 100).toFixed(1).replace(/\.0$/, "") + "%";
export const count = (v) => (v == null ? "Not available" : whole.format(v));
export const escapeHTML = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const median = (v) => (v >= 250001 ? "$250,000+" : money(v));
export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
export const layers = {
  tax: {
    field: "irs_income_per_household_2022",
    title: `The ${site.regionNoun}, by two accounts`,
    unit: "Annual income per household",
    description:
      `Tax records show ${site.regionName}’s income peaks. This view includes reported capital gains alongside wages and other income.`,
    limit:
      "Switch between sources to see how the geography changes. Same years, household counts, and dollar scale.",
    source: "IRS",
    format: money,
  },
  census: {
    field: "acs_mean_household_income",
    title: `The ${site.regionNoun}, by two accounts`,
    unit: "Annual income per household",
    description:
      "The American Community Survey (ACS) gives another view of household income. It counts wages, interest, and dividends, but excludes capital gains.",
    limit:
      "Switch between sources to see how the geography changes. Same years, household counts, and dollar scale.",
    source: "Census Bureau",
    format: money,
  },
};
export async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok)
    throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}
export function period(meta, source = "irs") {
  const years = meta.years[source];
  return `${years[0]}–${years.at(-1)}`;
}
const notice =
  `This is not an official product. It is an independent initiative, not affiliated with, endorsed by, or produced by the IRS, the U.S. Census Bureau, or the ${site.government}. Please refer to them for authoritative information.`;
export function chrome() {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelector('[data-chrome="masthead"]').innerHTML =
    `<div class="wrap masthead-inner"><a class="wordmark" href="index.html">Wealth <span>${site.shortName}</span></a><nav class="nav" aria-label="Sections">${[
      ["index.html", "Map"],
      ["data.html", "Data"],
      ["about.html", "About"],
    ]
      .map(
        ([url, label]) =>
          `<a href="${url}" ${page === url ? 'aria-current="page"' : ""}>${label}</a>`,
      )
      .join("")}</nav></div>`;
  const footer = document.querySelector('[data-chrome="footer"]');
  if (footer) {
    const links = (items) =>
      items
        .map(([href, label]) => `<li><a href="${href}">${label}</a></li>`)
        .join("");
    footer.className = "footer";
    footer.innerHTML = `<div class="wrap"><div class="footer-grid"><div><h4>Views</h4><ul>${links([["index.html", "Map"]])}</ul></div><div><h4>Reference</h4><ul>${links(
      [
        ["data.html", "Data"],
        ["about.html", "About"],
      ],
    )}</ul></div><div><h4>Project</h4><ul>${links([
      [site.repository, "Source code"],
      [
        `${site.repository}/issues`,
        "Report an issue",
      ],
    ])}</ul></div></div><p class="colophon"><strong>This is not an official product.</strong> It is an independent initiative, not affiliated with, endorsed by, or produced by the <a href="https://www.irs.gov/">IRS</a>, the <a href="https://www.census.gov/">U.S. Census Bureau</a>, or the ${site.government}. Please refer to them for authoritative information.</p><p class="portfolio">A <a href="https://publicworks.nyc/">publicworks.nyc</a> project.</p></div>`;
  }
  document
    .querySelectorAll("[data-notice]")
    .forEach((el) => (el.textContent = notice));
}

export const areaSearchText = (p) =>
  `${p.zip} ${p.zips_included} ${p.name} ${p[site.groupField]} ${p.municipalities || ""} ${p.counties || ""}`.toLowerCase();
export const fullDate = (value) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
}).format(new Date(value + "T00:00:00Z"));
