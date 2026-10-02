// PUPPETEER_MODULE may point to an existing puppeteer-core installation.
// CHROME_PATH is required; serve docs/ on localhost:8792 before running.
const puppeteer = require(process.env.PUPPETEER_MODULE || "puppeteer-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const site = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/js/site-config.js"), "utf8").replace("export const site = ", "").replace(/;\s*$/, ""));
const nj = site.shortName === "NJ";
const testZip = nj ? "08401" : "11220";
const secondZip = nj ? "07078" : "10021";
const areaCount = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/data/meta.json"))).region.areas;
const output = process.env.QA_OUTPUT || "/tmp/wealth-qa";
const base = process.env.QA_URL || "http://127.0.0.1:8792";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const settled = async () => {
      await page.waitForFunction(async () => {
        const { map } = await import(
          document.querySelector('script[type="module"][src]').src
        );
        return map?.loaded() && !map.isMoving();
      });
    };
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base, { waitUntil: "networkidle0" });
    await settled();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
      "Desktop map must fit viewport",
    );
    await page.screenshot({ path: output + "/desktop.png", fullPage: true });
    await page.type("#search", testZip);
    await page.keyboard.press("Enter");
    assert.match(await page.$eval("#selection", (e) => e.textContent), new RegExp(testZip));
    assert.equal(
      await page.$eval("#reading", (e) => getComputedStyle(e).display),
      "none",
    );
    assert.match(
      await page.$eval("#selection", (e) => e.textContent),
      new RegExp(`Share of ${site.shortName} investment income`),
    );
    assert.equal(
      await page.$$eval(
        "#compare, #compare-prompt, #layer",
        (els) => els.length,
      ),
      0,
    );
    await page.click('[data-layer="tax"]');
    await page.click("#flat");
    assert.equal(
      await page.$eval("#flat", (e) => e.getAttribute("aria-pressed")),
      "true",
    );
    await page.click("#stacked");
    await settled();
    const heights = await page.evaluate(async () => {
      const { map } = await import(
        document.querySelector('script[type="module"][src]').src
      );
      const before = map.getPaintProperty("areas", "fill-extrusion-height");
      map.jumpTo({ zoom: 12 });
      return [before, map.getPaintProperty("areas", "fill-extrusion-height")];
    });
    assert.deepEqual(heights[0], heights[1]);
    assert(!JSON.stringify(heights[0]).includes("zoom"));
    assert.equal(
      await page.$$eval("#share, #reset, .toolbar", (els) => els.length),
      0,
    );
    const taxScale = await page.evaluate(async () => {
      const { map } = await import(
        document.querySelector('script[type="module"][src]').src
      );
      return {
        height: map.getPaintProperty("areas", "fill-extrusion-height"),
        color: map.getPaintProperty("areas", "fill-extrusion-color"),
        bearing: map.getBearing(),
        dragRotate: map.dragRotate.isEnabled(),
      };
    });
    const outlines = await page.evaluate(async () => {
      const { map } = await import(
        document.querySelector('script[type="module"][src]').src
      );
      return {
        roof: map.getLayer("roof-edges")?.type,
        ground: !!map.getLayer("edges"),
      };
    });
    assert.equal(outlines.roof, "custom");
    assert.equal(outlines.ground, false);
    assert.equal(
      await page.$$eval(".maplibregl-ctrl-attrib", (els) => els.length),
      0,
    );
    assert.equal(taxScale.bearing, 0);
    assert.equal(taxScale.dragRotate, true);
    await page.click('[data-camera="right"]');
    await settled();
    assert.equal(
      await page.evaluate(async () =>
        (
          await import(document.querySelector('script[type="module"][src]').src)
        ).map.getBearing(),
      ),
      45,
    );
    await page.click('[data-camera="north"]');
    await settled();
    assert.equal(
      await page.evaluate(async () =>
        (
          await import(document.querySelector('script[type="module"][src]').src)
        ).map.getBearing(),
      ),
      0,
    );
    await page.click('[data-camera="right"]');
    await settled();
    await page.click(".area-notes summary");
    const stableCard = await page.$eval(
      "#selection",
      (element) => element.innerHTML,
    );
    await page.click('[data-layer="census"]');
    assert.equal(
      await page.$eval("#selection", (element) => element.innerHTML),
      stableCard,
      "Source switching keeps the card and expanded notes unchanged",
    );
    assert(await page.$eval(".area-notes", (element) => element.open));
    await page.click(".area-notes summary");
    const censusScale = await page.evaluate(async () => {
      const { map } = await import(
        document.querySelector('script[type="module"][src]').src
      );
      return {
        height: map.getPaintProperty("areas", "fill-extrusion-height"),
        color: map.getPaintProperty("areas", "fill-extrusion-color"),
        bearing: map.getBearing(),
      };
    });
    assert.equal(
      taxScale.height.at(-1),
      censusScale.height.at(-1),
      "Shared dollar height scale",
    );
    assert.deepEqual(
      taxScale.color.at(-1).slice(3),
      censusScale.color.at(-1).slice(3),
      "Shared color stops",
    );
    assert.match(JSON.stringify(taxScale.color), /#f0c75e/);
    assert.match(JSON.stringify(taxScale.color), new RegExp(testZip));
    assert.equal(
      censusScale.bearing,
      45,
      "Switching sources preserves rotation",
    );
    await page.click('[data-camera="north"]');
    await settled();
    assert.equal(
      await page.evaluate(async () =>
        (
          await import(document.querySelector('script[type="module"][src]').src)
        ).map.getBearing(),
      ),
      0,
    );
    const initialZoom = await page.evaluate(async () =>
      (
        await import(document.querySelector('script[type="module"][src]').src)
      ).map.getZoom(),
    );
    await page.click('[data-camera="in"]');
    await settled();
    assert.equal(
      await page.evaluate(async () =>
        (
          await import(document.querySelector('script[type="module"][src]').src)
        ).map.getZoom(),
      ),
      initialZoom + 1,
    );
    await page.click('[data-camera="out"]');
    await settled();
    assert.equal(
      await page.evaluate(async () =>
        (
          await import(document.querySelector('script[type="module"][src]').src)
        ).map.getZoom(),
      ),
      initialZoom,
    );
    await page.setViewport({ width: 1280, height: 800 });
    await settled();
    assert(
      await page.evaluate(
        () =>
          document.querySelector(".selection-card").getBoundingClientRect()
            .bottom <=
          document.getElementById("reader-content").getBoundingClientRect()
            .bottom,
      ),
      "Complete selected card fits a 1280×800 viewport",
    );
    await page.setViewport({ width: 1440, height: 1000 });
    await settled();
    const shared = page.url();
    await page.goto(shared, { waitUntil: "networkidle0" });
    await settled();
    assert.equal(await page.$$eval(".selection-card", (els) => els.length), 1);
    await page.click('[data-layer="census"]');
    assert.match(
      await page.$eval("#selection", (e) => e.textContent),
      /2022 dollars/,
    );
    assert.equal(await page.$$eval(".selection-card", (els) => els.length), 1);
    await page.type("#search", "zzzzzz");
    assert.match(
      await page.$eval("#results", (e) => e.textContent),
      /No matching/,
    );
    await page.keyboard.press("Escape");
    await page.goto(base + "/data.html", { waitUntil: "networkidle0" });
    assert.equal(await page.$$eval("#rows tr", (els) => els.length), areaCount);
    await page.type("#filter", nj ? "Atlantic City" : "Sunset Park");
    assert((await page.$$eval("#rows tr", (els) => els.length)) >= (nj ? 1 : 2));
    await page.select("#sort", "zip");
    await page.screenshot({
      path: output + "/data-desktop.png",
      fullPage: true,
    });
    for (const file of [
      `${site.dataStem}.csv`,
      `${site.dataStem}.geojson`,
      "meta.json",
    ])
      assert.equal(
        await page.evaluate(
          async (url) => (await fetch(url)).status,
          base + "/data/" + file,
        ),
        200,
      );
    for (const width of [320, 375, 390, 768]) {
      await page.setViewport({
        width,
        height: width === 375 ? 812 : 844,
        isMobile: width < 720,
        hasTouch: width < 720,
      });
      await page.goto(base, { waitUntil: "networkidle0" });
      await settled();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Map overflow at ${width}`,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
        `Map page scrolls at ${width}`,
      );
      if (width < 720) {
        assert(
          await page.evaluate(
            () =>
              document.querySelector("#search").getBoundingClientRect().top <
              document.querySelector("#map").getBoundingClientRect().top,
          ),
        );
      }
      if (width < 720) {
        await page.screenshot({ path: output + "/mobile.png", fullPage: true });
        await page.click('[data-layer="census"]');
        assert.equal(
          await page.$eval(
            '[data-camera="right"]',
            (e) => getComputedStyle(e.parentElement).display,
          ),
          "none",
        );
        assert.equal(
          await page.$eval(".atlas-foot", (e) => getComputedStyle(e).display),
          "none",
        );
        assert.equal(
          await page.$eval("#reading", (e) => getComputedStyle(e).display),
          "none",
        );
        await page.type("#search", testZip);
        await page.keyboard.press("Enter");
        assert.equal(
          await page.$eval(".reader", (e) => e.getAttribute("aria-modal")),
          "true",
        );
        assert(
          await page.evaluate(
            () => document.documentElement.scrollHeight <= innerHeight,
          ),
        );
        assert(
          await page.evaluate(() => {
            const panel = document
              .querySelector(".reader")
              .getBoundingClientRect();
            return (
              panel.top === 0 &&
              panel.bottom === innerHeight &&
              panel.width === innerWidth
            );
          }),
          "Mobile card must fill the screen",
        );
        assert.equal(
          await page.$eval("#mobile-search-slot", (e) => e.inert),
          true,
        );
        assert.equal(
          await page.$eval("#back-to-map", (e) => e === document.activeElement),
          true,
        );
        await page.screenshot({
          path: output + `/mobile-selected-${width}.png`,
          fullPage: true,
        });
        await page.click("#back-to-map");
        assert.equal(
          await page.$eval(".reader", (e) => getComputedStyle(e).display),
          "none",
        );
        assert.equal(
          await page.$eval("#mobile-search-slot", (e) => e.inert),
          false,
        );
        assert(!new URL(await page.url()).hash.includes("zip="));
        assert.equal(
          await page.$eval("#search", (e) => e === document.activeElement),
          false,
          "Returning to map must not open the phone keyboard",
        );
      }
      await page.goto(base + "/data.html", { waitUntil: "networkidle0" });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `Data overflow at ${width}`,
      );
      await page.goto(base + "/about.html", { waitUntil: "networkidle0" });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `About overflow at ${width}`,
      );
    }
    assert.deepEqual(errors, []);
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.goto(base + `/#layer=tax&zip=${secondZip}`, {
      waitUntil: "networkidle0",
    });
    await settled();
    assert.match(await page.$eval("#selection", (e) => e.textContent), new RegExp(secondZip));
    const fallback = await browser.newPage();
    await fallback.setRequestInterception(true);
    fallback.on("request", (req) =>
      req.url().endsWith("maplibre-gl.js") ? req.abort() : req.continue(),
    );
    await fallback.goto(base, { waitUntil: "networkidle0" });
    assert.match(
      await fallback.$eval("#map-message", (e) => e.textContent),
      /could not load/,
    );
    await fallback.type("#search", testZip);
    await fallback.keyboard.press("Enter");
    assert.match(
      await fallback.$eval("#selection", (e) => e.textContent),
      new RegExp(testZip),
    );
    console.log(
      "PASS: map render; search; single selection; source buttons; stable two-source card; zoom; desktop rotation and north reset; full-screen mobile card and return; fixed heights; shared URL; table; downloads; 320/375/390/768px overflow; reduced motion; no-library fallback; no browser errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
