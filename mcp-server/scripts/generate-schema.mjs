import { writeFile, readFile } from "node:fs/promises";
import * as z from "zod/v4";
import { figureSpecSchema } from "../src/schemas.mjs";
const schema = z.toJSONSchema(figureSpecSchema, { unrepresentable: "any", io: "input" });
schema.title = "PhyloRender figure specification: physical units";
schema.description = "pt typography, em row spacing, mm figure width, DPI raster density. Legacy logical-pixel parameters remain accepted. Aggregate tree-text limits are additionally checked by the runtime.";
const target = new URL("../schemas/figure-spec.schema.json", import.meta.url);
const content = JSON.stringify(schema, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== content) throw new Error("SCHEMA_STALE: regenerate the shared figure schema");
} else await writeFile(target, content);
