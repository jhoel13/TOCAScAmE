import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

test("el artefacto de producción contiene identidad, persistencia y tarjeta social", async () => {
  const hosting = JSON.parse(
    await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
  );
  assert.equal(hosting.d1, "DB");

  const clientManifest = await readFile(
    new URL("../dist/client/.vite/manifest.json", import.meta.url),
    "utf8",
  );
  assert.match(clientManifest, /TrussApp/);

  const serverBundle = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );
  assert.match(serverBundle, /TOCAS Matriz/);
  assert.match(serverBundle, /Análisis de Armaduras 2D/);

  const socialCard = new URL("../dist/client/og.png", import.meta.url);
  await access(socialCard);
  assert.ok((await stat(socialCard)).size > 50_000);
});
