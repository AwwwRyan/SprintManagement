"use client";

/**
 * "Export PDF": a picture of an element as rendered (the dashboard report, in the current
 * theme), on one page sized to the content so no card is split across pages.
 * Both libraries load only when someone exports.
 */

/** PDF pages can't be taller than 14,400 pt. */
const MAX_PAGE_PT = 14_000;
/** Browsers refuse canvases much taller than ~16k px. */
const MAX_CANVAS_PX = 16_000;
const PAD_PX = 24;
/** Height of each image strip in the PDF (canvas px). */
const STRIP_PX = 3000;

/**
 * The page's visible background (body, else html, else white) as RGB. Theme colours are
 * oklch(), which jsPDF can't read, so a 1-pixel canvas does the conversion.
 */
function pageBackground(): { css: string; rgb: [number, number, number] } {
  const ctx = document.createElement("canvas").getContext("2d");
  for (const el of [document.body, document.documentElement]) {
    const color = getComputedStyle(el).backgroundColor;
    if (!ctx || !color) continue;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a > 0) return { css: `rgb(${r}, ${g}, ${b})`, rgb: [r, g, b] };
  }
  return { css: "rgb(255, 255, 255)", rgb: [255, 255, 255] };
}

/** Builds the PDF (shown in a preview first, then saved with `saveBlob`). */
export async function elementToPdf(el: HTMLElement): Promise<Blob> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const background = pageBackground();
  const width = el.scrollWidth;
  const height = el.scrollHeight;

  const canvas = await toCanvas(el, {
    width,
    height,
    backgroundColor: background.css,
    pixelRatio: Math.min(2, MAX_CANVAS_PX / height),
  });

  // 1 px = 0.75 pt, scaled down further only for very long pages
  const scale = Math.min(0.75, MAX_PAGE_PT / (height + PAD_PX * 2));
  const pageW = (width + PAD_PX * 2) * scale;
  const pageH = (height + PAD_PX * 2) * scale;
  const pdf = new jsPDF({ unit: "pt", format: [pageW, pageH], orientation: pageW > pageH ? "landscape" : "portrait", compress: true });
  pdf.setFillColor(...background.rgb);
  pdf.rect(0, 0, pageW, pageH, "F");

  // Browser PDF viewers garble one huge image (a tall release is ~2400 × 16000 px), so the
  // picture goes in as JPEG strips stacked on the same page. JPEG data is embedded as-is.
  const ptPerCanvasPx = (width * scale) / canvas.width;
  const strip = document.createElement("canvas");
  strip.width = canvas.width;
  const ctx = strip.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available");
  for (let y = 0; y < canvas.height; y += STRIP_PX) {
    const h = Math.min(STRIP_PX, canvas.height - y);
    strip.height = h;
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    pdf.addImage(strip.toDataURL("image/jpeg", 0.92), "JPEG", PAD_PX * scale, PAD_PX * scale + y * ptPerCanvasPx, width * scale, h * ptPerCanvasPx);
  }
  return pdf.output("blob");
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
