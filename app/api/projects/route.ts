import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import type { TrussModel } from "@/lib/truss";

export const dynamic = "force-dynamic";

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  if (message.includes("no such table") || message.includes("projects")) {
    return "El almacenamiento de proyectos aún no está inicializado.";
  }
  return "No se pudo acceder al almacenamiento de proyectos.";
}

async function authenticatedEmail() {
  const user = await getChatGPTUser();
  return user?.email.toLowerCase() ?? null;
}

function isTrussModel(value: unknown): value is TrussModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<TrussModel>;
  return Boolean(
    model.project &&
      typeof model.project.id === "string" &&
      model.project.id.length >= 3 &&
      model.units &&
      Array.isArray(model.nodes) &&
      Array.isArray(model.elements),
  );
}

export async function GET() {
  const email = await authenticatedEmail();
  if (!email) return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });

  try {
    const rows = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.ownerEmail, email))
      .orderBy(desc(projects.updatedAt))
      .limit(100);

    return Response.json({
      projects: rows.flatMap((row) => {
        try {
          return [{
            id: row.id,
            name: row.name,
            data: JSON.parse(row.data) as TrussModel,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }];
        } catch {
          return [];
        }
      }),
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const email = await authenticatedEmail();
  if (!email) return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });

  try {
    const payload = (await request.json()) as { model?: unknown };
    if (!isTrussModel(payload.model)) {
      return Response.json({ error: "El proyecto no tiene un formato válido." }, { status: 400 });
    }

    const model = payload.model;
    const serialized = JSON.stringify(model);
    if (serialized.length > 1_800_000) {
      return Response.json({ error: "El proyecto excede el tamaño permitido." }, { status: 413 });
    }

    const db = getDb();
    const [existing] = await db
      .select({ ownerEmail: projects.ownerEmail })
      .from(projects)
      .where(eq(projects.id, model.project.id))
      .limit(1);
    if (existing && existing.ownerEmail !== email) {
      return Response.json({ error: "No tienes acceso a este proyecto." }, { status: 403 });
    }

    const now = new Date().toISOString();
    if (existing) {
      await db
        .update(projects)
        .set({
          name: model.project.name.trim() || "Proyecto sin nombre",
          data: serialized,
          updatedAt: now,
        })
        .where(and(eq(projects.id, model.project.id), eq(projects.ownerEmail, email)));
    } else {
      await db.insert(projects).values({
        id: model.project.id,
        ownerEmail: email,
        name: model.project.name.trim() || "Proyecto sin nombre",
        data: serialized,
        createdAt: now,
        updatedAt: now,
      });
    }

    return Response.json({ id: model.project.id, savedAt: now });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const email = await authenticatedEmail();
  if (!email) return Response.json({ error: "Debes iniciar sesión." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Falta el identificador." }, { status: 400 });

  try {
    await getDb()
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerEmail, email)));
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

