import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const source = path.join(
  process.cwd(),
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"
);
const targetDirectory = path.join(process.cwd(), "public");
const target = path.join(targetDirectory, "pdf.worker.min.mjs");

await mkdir(targetDirectory, { recursive: true });
await copyFile(source, target);
