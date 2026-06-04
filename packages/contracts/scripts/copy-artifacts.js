// Läuft als `postcompile` (siehe package.json). Spiegelt nach dem Compile die
// generierten ABIs und TypeChain-Typen ins Frontend ("Adresse + ABI ins Frontend").
//
// WICHTIG: packages/contracts ist "type":"module" -> diese .js-Datei IST ein ES
// Module. Deshalb KEIN require()/__dirname, sondern import + import.meta.dirname,
// und relative Imports immer mit Endung. Reine Build-Plumbing, keine Logik.

import { cp, rm, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const contractsRoot = path.resolve(import.meta.dirname, "..");
const frontendContracts = path.resolve(
  contractsRoot,
  "..",
  "frontend",
  "src",
  "contracts",
);

const typesSrc = path.join(contractsRoot, "types", "ethers-contracts");
const artifactsContracts = path.join(contractsRoot, "artifacts", "contracts");

const typesOut = path.join(frontendContracts, "typechain");
const abiOut = path.join(frontendContracts, "abi");

const rel = (p) => path.relative(contractsRoot, p);

async function copyTypechain() {
  if (!existsSync(typesSrc)) {
    console.warn(`[copy-artifacts] keine TypeChain-Typen unter ${rel(typesSrc)} — übersprungen`);
    return false;
  }
  await rm(typesOut, { recursive: true, force: true });
  await mkdir(typesOut, { recursive: true });
  // hardhat.d.ts augmentiert das "hardhat"-Modul und gehört NICHT ins Frontend.
  await cp(typesSrc, typesOut, {
    recursive: true,
    filter: (src) => path.basename(src) !== "hardhat.d.ts",
  });
  return true;
}

async function* walkJson(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkJson(full);
    } else if (full.endsWith(".json") && !full.endsWith(".dbg.json")) {
      yield full;
    }
  }
}

async function copyAbis() {
  if (!existsSync(artifactsContracts)) {
    console.warn(`[copy-artifacts] keine Artifacts unter ${rel(artifactsContracts)} — übersprungen`);
    return 0;
  }
  await rm(abiOut, { recursive: true, force: true });
  await mkdir(abiOut, { recursive: true });
  let count = 0;
  for await (const file of walkJson(artifactsContracts)) {
    const artifact = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(artifact.abi)) continue;
    const name = artifact.contractName ?? path.basename(file, ".json");
    await writeFile(
      path.join(abiOut, `${name}.json`),
      `${JSON.stringify(artifact.abi, null, 2)}\n`,
    );
    count++;
  }
  return count;
}

await mkdir(frontendContracts, { recursive: true });
const typechainCopied = await copyTypechain();
const abiCount = await copyAbis();
console.log(
  `[copy-artifacts] ${abiCount} ABI(s) -> ${rel(abiOut)}; ` +
    `TypeChain ${typechainCopied ? "kopiert" : "fehlt"} -> ${rel(typesOut)}`,
);
