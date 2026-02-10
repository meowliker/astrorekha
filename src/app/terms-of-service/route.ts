import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "Terms", "terms-of-service.html");
    const html = await readFile(filePath, "utf8");

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
