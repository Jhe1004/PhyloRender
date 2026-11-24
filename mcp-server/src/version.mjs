import {readFileSync} from 'node:fs';
import build from "../../core/build-info.js";

// Read one version source for HTTP health and MCP initialization.
export const VERSION = JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
export const BUILD = build;
