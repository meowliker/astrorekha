import { NextRequest } from "next/server";
import sharp from "sharp";
import { createReportSession } from "@/lib/report-session";
import { buildPastLifeReport } from "@/lib/past-life-report";
import {
  buildAstrocartographyReport,
  hasUsableAstrocartographyLines,
} from "@/lib/astrocartography-report";
import { downloadImage } from "@/lib/soulmate-fulfillment";
import { db, checked } from "./auth";
import {
  REPORTS,
  ReportKey,
  SupportError,
  hasContent,
  reportReady,
} from "./policy";
import { USER_FIELDS } from "./customer";
import {
  getBirthDateIso,
  getBirthTime24,
  normalizeBirthDetailsSnapshot,
} from "@/lib/birth-details";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { extractStoredSignName } from "@/lib/zodiac-utils";
import { getVedicSignsFromChart } from "@/lib/vedic-signs";
import { generateFuturePartnerReport } from "@/lib/future-partner-report";
import {
  buildSoulmateSketchPrompt,
  generateSoulmateSketchFromKie,
  getSoulmateSketchJobStatusFromKie,
  KieTimeoutError,
} from "@/lib/soulmate-sketch";
import {
  DEFAULT_LAYOUT_B_CONFIG,
  normalizeLayoutBConfig,
} from "@/lib/layout-b-funnel";

const internalRequest = (path: string, id: string, body: unknown = {}) =>
  new NextRequest(`https://astrorekha.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `ar_access=${encodeURIComponent(id)}; ar_report_session=${createReportSession(id)}`,
      "x-user-id": id,
    },
    body: JSON.stringify(body),
  });
async function invoke(
  handler: (r: NextRequest) => Promise<Response>,
  path: string,
  id: string,
  body: unknown = {},
) {
  const response = await handler(internalRequest(path, id, body));
  const data = await response.json();
  if (!response.ok || data.success === false || data.error)
    throw new SupportError(
      "Report service could not complete the recovery. The case remains open.",
      502,
    );
  return data;
}
export function birthInput(row: Record<string, unknown>) {
  return {
    birthMonth: row.birth_month,
    birthDay: row.birth_day,
    birthYear: row.birth_year,
    birthHour: row.birth_hour,
    birthMinute: row.birth_minute,
    birthPeriod: row.birth_period,
    birthPlace: row.birth_place,
    knowsBirthTime: row.knows_birth_time !== false,
  };
}
export async function calculateBirth(input: Record<string, unknown>) {
  const snapshot = normalizeBirthDetailsSnapshot(input, "support");
  if (!snapshot?.completeForBirthChart || !snapshot.hasBirthTime)
    throw new SupportError(
      "Complete birth date, time and place are required. Check the saved profile and payment data first.",
    );
  const date = getBirthDateIso(input)!,
    time = getBirthTime24(input)!;
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute] = time.split(":").map(Number);
  const result = await fetchFromAstroEngine(
    "/calculate",
    { year, month, day, hour, minute, second: 0, place: snapshot.birthPlace },
    25000,
  );
  const signs = getVedicSignsFromChart(result.chart);
  if (!signs)
    throw new SupportError(
      "Birth details could not be verified by the chart service",
    );
  return { snapshot, date, time, result, signs };
}
async function savedInputs(user: Record<string, unknown>, palmOnly = false) {
  const required = palmOnly ? "completeForPalm" : "completeForBirthChart";
  const profile = checked(
    await db()
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(),
  );
  // Exact email links only; no name-based identity guesses or fuzzy account merges.
  const linked =
    checked(
      await db()
        .from("user_profiles")
        .select("*")
        .eq("email", String(user.email))
        .neq("id", String(user.id))
        .limit(20),
    ) || [];
  const purchases =
    checked(
      await db()
        .from("payments")
        .select("user_id,birth_details_snapshot")
        .eq("customer_email", String(user.email))
        .in("payment_status", ["paid", "success", "captured"])
        .limit(100),
    ) || [];
  const linkedIds = Array.from(
    new Set(
      purchases
        .map((p) => p.user_id)
        .filter(
          (id) => id && id !== user.id && !linked.some((p) => p.id === id),
        ),
    ),
  );
  if (linkedIds.length) {
    const accounts =
      checked(
        await db().from("users").select("id,email").in("id", linkedIds),
      ) || [];
    const safe = linkedIds.filter(
      (id) =>
        !accounts.some(
          (a) =>
            a.id === id &&
            a.email &&
            a.email.toLowerCase() !== String(user.email).toLowerCase(),
        ),
    );
    if (safe.length)
      linked.push(
        ...(checked(
          await db().from("user_profiles").select("*").in("id", safe),
        ) || []),
      );
  }
  const candidates = [profile, user, ...linked].filter(Boolean);
  const native = candidates
    .slice(0, 2)
    .find(
      (row) =>
        normalizeBirthDetailsSnapshot(birthInput(row), "support")?.[required],
    );
  let birth = native ? birthInput(native) : null;
  if (!birth) {
    const snapshots = [
      ...linked.map(birthInput),
      ...purchases.map((p) => p.birth_details_snapshot),
    ].filter(
      (s) => s && normalizeBirthDetailsSnapshot(s, "support")?.[required],
    );
    const distinct = new Map(
      snapshots.map((s) => [
        JSON.stringify([getBirthDateIso(s), getBirthTime24(s), s.birthPlace]),
        s,
      ]),
    );
    if (distinct.size > 1)
      throw new SupportError(
        "Conflicting saved birth details. Review the records before correcting this account.",
      );
    birth = snapshots[0] || null;
  }
  return { profile, linked, purchases, birth };
}
async function palmImage(
  userId: string,
  profile: Record<string, unknown> | null,
  linked: Record<string, unknown>[],
  old: Record<string, unknown> | null,
) {
  let source =
    old?.palm_image_url || profile?.palm_image_url || profile?.palm_image;
  if (!source) {
    const rows = linked.length
      ? checked(
          await db()
            .from("palm_readings")
            .select("palm_image_url")
            .in(
              "id",
              linked.map((p) => p.id),
            ),
        )
      : [];
    const alternateImages = Array.from(
      new Set(
        [
          ...linked.flatMap((p) => [p.palm_image_url, p.palm_image]),
          ...(rows || []).map((r) => r.palm_image_url),
        ].filter(Boolean),
      ),
    );
    if (alternateImages.length > 1)
      throw new SupportError(
        "Multiple saved palm images require review; no image has been replaced.",
      );
    source = alternateImages[0];
  }
  if (!source) {
    const files =
      checked(
        await db()
          .storage.from("palm-images")
          .list("palm_images", {
            search: `${userId}_`,
            limit: 100,
            sortBy: { column: "created_at", order: "desc" },
          }),
      ) || [];
    const exact = files.filter((f) => f.name.startsWith(`${userId}_`));
    if (exact.length > 1)
      throw new SupportError("Multiple stored palm images need review.");
    if (exact[0])
      source = db()
        .storage.from("palm-images")
        .getPublicUrl(`palm_images/${exact[0].name}`).data.publicUrl;
  }
  if (typeof source !== "string" || !source)
    throw new SupportError(
      "No saved palm image found in profiles, report or storage. Keep the case open and check the customer’s upload flow.",
    );
  let bytes: Buffer;
  if (source.startsWith("data:image/"))
    bytes = Buffer.from(source.split(",")[1] || "", "base64");
  else {
    const url = new URL(source);
    const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    if (
      url.origin !== storageOrigin ||
      !url.pathname.startsWith("/storage/v1/object/")
    )
      throw new SupportError("Saved image location needs review");
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 12000000
    )
      throw new SupportError("Saved image is unavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body!.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 12000000) {
        await reader.cancel();
        throw new SupportError("Saved image too large");
      }
      chunks.push(next.value);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > 12000000) throw new SupportError("Saved image too large");
  const jpeg = await sharp(bytes, { limitInputPixels: 40000000 })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
export async function recoverReport(
  userId: string,
  key: ReportKey,
  force: boolean,
  actionId: string,
) {
  const spec = REPORTS[key];
  if (!spec) throw new SupportError("Unknown report");
  const user = checked(
    await db().from("users").select(USER_FIELDS).eq("id", userId).single(),
  );
  if (!user) throw new SupportError("Customer not found", 404);
  if (!user.unlocked_features?.[key])
    throw new SupportError(
      "This report is not purchased. Verify its payment before recovery.",
    );
  const old = checked(
    await db()
      .from(spec.table)
      .select("*")
      .eq(spec.key, userId)
      .order(key === "witchArchetypeReport" ? "updated_at" : "created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
  );
  if (!force && reportReady(key, old, true)) {
    if (key === "soulmateSketch")
      await downloadImage(String(old.sketch_image_url));
    return { ready: true, report: key, reused: true };
  }
  // Keep the previous saved content for traceability. Never remove an existing palm image.
  checked(
    await db()
      .from("support_actions")
      .update({
        before_data: old
          ? {
              report: key,
              record: Object.fromEntries(
                Object.entries(old).filter(([k]) => k !== "palm_image_url"),
              ),
            }
          : null,
      })
      .eq("id", actionId),
  );
  const inputs = await savedInputs(user, key === "palmReading");
  const birthReports = [
    "birthChart",
    "futurePartnerReport",
    "pastLifeReport",
    "astrocartographyReport",
  ];
  let calculated: Awaited<ReturnType<typeof calculateBirth>> | null = null;
  if (birthReports.includes(key)) {
    if (!inputs.birth)
      throw new SupportError(
        "Birth details were not found in saved customer, profile or payment records. The case needs input.",
      );
    // Recovered alternate details must be reviewed and saved through correct_birth first.
    if (
      !normalizeBirthDetailsSnapshot(
        birthInput(inputs.profile || user),
        "support",
      )?.completeForBirthChart
    )
      throw new SupportError(
        "Saved birth details were found. Apply a birth-details correction before generating this report.",
      );
    calculated = await calculateBirth(inputs.birth);
    checked(
      await db().from("natal_charts").upsert(
        {
          id: userId,
          chart: calculated.result.chart,
          dasha: calculated.result.dasha,
          signs: calculated.signs,
          birth_data: inputs.birth,
          calculated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      ),
    );
  }
  if (key === "palmReading") {
    const birth = [inputs.profile, user]
      .filter(Boolean)
      .map((row) => birthInput(row!))
      .find((input) => getBirthDateIso(input));
    const palmDate = birth && getBirthDateIso(birth);
    if (!birth || !palmDate)
      throw new SupportError(
        "The primary account needs its verified birth date saved before Palm Reading recovery.",
      );
    let palmSign =
      extractStoredSignName(inputs.profile?.sun_sign) ||
      extractStoredSignName(user.sun_sign);
    const fullBirth = normalizeBirthDetailsSnapshot(birth, "support");
    if (fullBirth?.completeForBirthChart && fullBirth.hasBirthTime)
      palmSign = (await calculateBirth(birth)).signs.sun;
    if (!palmSign)
      throw new SupportError(
        "The account has no verified saved Sun sign. Review its birth details before recovery.",
      );
    const image = await palmImage(userId, inputs.profile, inputs.linked, old);
    const data = await invoke(
      (await import("@/app/api/palm-reading/route")).POST,
      "/api/palm-reading",
      userId,
      {
        userId,
        imageData: image,
        birthDate: palmDate,
        zodiacSign: palmSign,
        gender: user.gender,
      },
    );
    if (!hasContent(data.reading))
      throw new SupportError("Palm report was empty");
    checked(
      await db()
        .from("palm_readings")
        .upsert(
          {
            id: userId,
            reading: data.reading,
            palm_image_url: old?.palm_image_url || image,
            birth_date: palmDate,
            zodiac_sign: palmSign,
            deleted_at: null,
            created_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        ),
    );
    checked(
      await db()
        .from("user_profiles")
        .update({
          palm_reading_result: data.reading,
          palm_reading_date: new Date().toISOString(),
        })
        .eq("id", userId),
    );
  } else if (key === "birthChart") {
    await invoke(
      (await import("@/app/api/birth-chart-report/generate/route")).POST,
      "/api/birth-chart-report/generate",
      userId,
      { force: true },
    );
  } else if (key === "futurePartnerReport") {
    const report = await generateFuturePartnerReport({
      user: {
        ...user,
        sun_sign: calculated!.signs.sun,
        moon_sign: calculated!.signs.moon,
        ascendant_sign: calculated!.signs.ascendant,
      },
      userProfile: inputs.profile,
      chartData: {
        chart: calculated!.result.chart,
        dasha: calculated!.result.dasha,
      },
      usageLogContext: { userId, reportId: old?.id },
    });
    checked(
      await db().from(spec.table).upsert(
        {
          user_id: userId,
          status: "complete",
          report_data: report,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      ),
    );
  } else if (key === "pastLifeReport") {
    const c = calculated!;
    const signs = {
      sun_sign: c.signs.sun,
      moon_sign: c.signs.moon,
      ascendant_sign: c.signs.ascendant,
    };
    const report = buildPastLifeReport({
      userId,
      name: user.name,
      email: user.email,
      user: { ...user, ...signs },
      userProfile: { ...(inputs.profile || {}), ...signs },
      chartData: { planets: c.result.chart.planets },
      generatedAt: new Date().toISOString(),
    });
    if (!report)
      throw new SupportError(
        "Past Life report could not be generated from the saved details",
      );
    checked(
      await db().from(spec.table).upsert(
        {
          user_id: userId,
          status: "complete",
          birth_data: report.birthData,
          report_data: report,
          generated_at: report.generatedAt,
          updated_at: report.generatedAt,
        },
        { onConflict: "user_id" },
      ),
    );
  } else if (key === "astrocartographyReport") {
    const c = calculated!,
      source = c.result.chart.birth_data;
    const [year, month, day] = c.date.split("-").map(Number);
    const [hour, minute] = c.time.split(":").map(Number);
    // Derive the historical UTC offset from the engine's resolved Julian day.
    // This avoids silently substituting Delhi or guessing timezone from longitude.
    const utcMs = (Number(source?.julian_day) - 2440587.5) * 86400000;
    const timezone =
      Math.round(
        (Date.UTC(year, month - 1, day, hour, minute) - utcMs) / 60000,
      ) / 60;
    const latitude = Number(source?.latitude),
      longitude = Number(source?.longitude);
    if (
      source?.date !== c.date ||
      !Number.isFinite(timezone) ||
      Math.abs(timezone) > 14 ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      throw new SupportError(
        "Verified birthplace coordinates and timezone are required",
      );
    if (!process.env.ASTROLOGY_API)
      throw new SupportError("Astrocartography provider is not configured");
    const birthData = {
      year,
      month,
      day,
      hour,
      minute,
      place: String(c.snapshot.birthPlace),
      latitude,
      longitude,
      timezone,
    };
    const response = await fetch(
      "https://json.astrologyapi.com/v1/acg/travel",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-astrologyapi-key": process.env.ASTROLOGY_API,
        },
        body: JSON.stringify({
          day,
          month,
          year,
          hour,
          min: minute,
          second: 0,
          tzone: timezone,
          lat: latitude,
          lon: longitude,
          include_parans: false,
        }),
        signal: AbortSignal.timeout(50000),
      },
    );
    const provider = await response.json();
    if (!response.ok || !hasUsableAstrocartographyLines(provider))
      throw new SupportError("Astrocartography provider has no usable result");
    const report = buildAstrocartographyReport(provider, birthData);
    checked(
      await db().from(spec.table).upsert(
        {
          user_id: userId,
          status: "complete",
          birth_data: birthData,
          provider: "astrologyapi",
          provider_response: provider,
          report_data: report,
          generated_at: report.generatedAt,
          updated_at: report.generatedAt,
        },
        { onConflict: "user_id" },
      ),
    );
  } else if (key === "soulmateSketch") {
    let answers = old?.question_answers;
    if (!hasContent(answers)) {
      const ids = inputs.linked.map((p) => p.id);
      const alternatives = ids.length
        ? checked(
            await db()
              .from("soulmate_sketches")
              .select("question_answers")
              .in("user_id", ids),
          )
        : [];
      const found = (alternatives || []).filter((x) =>
        hasContent(x.question_answers),
      );
      if (found.length !== 1)
        throw new SupportError(
          "Saved sketch answers are missing or ambiguous. Check the questionnaire in the app.",
        );
      answers = found[0].question_answers;
    }
    const configRow = checked(
      await db()
        .from("settings")
        .select("value")
        .eq("key", "funnel_layout_b_config")
        .maybeSingle(),
    );
    const config = normalizeLayoutBConfig(
      configRow?.value || DEFAULT_LAYOUT_B_CONFIG,
    );
    // Resume an existing job before creating another paid provider request.
    let generated: { imageUrl: string; providerJobId?: string | null };
    if (old?.status === "generating" && old.provider_job_id) {
      const job = await getSoulmateSketchJobStatusFromKie(old.provider_job_id);
      if (job.state !== "success" || !job.imageUrl)
        throw new SupportError(
          "The existing sketch job has not completed. Check recovery again before drafting.",
          409,
        );
      generated = {
        imageUrl: job.imageUrl,
        providerJobId: old.provider_job_id,
      };
    } else {
      const prompt = buildSoulmateSketchPrompt(answers, user);
      try {
        generated = await generateSoulmateSketchFromKie({ prompt, config });
      } catch (error) {
        if (error instanceof KieTimeoutError)
          checked(
            await db().from(spec.table).upsert(
              {
                user_id: userId,
                status: "generating",
                question_answers: answers,
                provider_job_id: error.jobId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            ),
          );
        throw error;
      }
    }
    const asset = await downloadImage(generated.imageUrl);
    const assetPath = `recovered_sketches/${userId}/${actionId}.${asset.extension}`;
    checked(
      await db().storage.from("palm-images").upload(assetPath, asset.buffer, {
        contentType: asset.contentType,
        upsert: false,
      }),
    );
    const savedUrl = db().storage.from("palm-images").getPublicUrl(assetPath)
      .data.publicUrl;
    const accessible = await fetch(savedUrl, {
      method: "HEAD",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!accessible.ok)
      throw new SupportError(
        "The saved sketch image is not accessible. Keep the case open.",
      );
    checked(
      await db()
        .from(spec.table)
        .upsert(
          {
            user_id: userId,
            status: "complete",
            question_answers: answers,
            sketch_image_url: savedUrl,
            provider_job_id: generated.providerJobId,
            generation_count: (old?.generation_count || 0) + 1,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        ),
    );
  } else {
    if (!hasContent(old?.answers))
      throw new SupportError(
        "No saved quiz answers. The customer can complete this quiz in the app.",
      );
    if (force && reportReady(key, old, true))
      throw new SupportError(
        "A completed quiz report is already saved. Use the approved quiz reset workflow to retake it.",
      );
    if (key === "auraColorReport")
      await invoke(
        (await import("@/app/api/aura-color-report/submit/route")).POST,
        "/api/aura-color-report/submit",
        userId,
        { answers: old.answers },
      );
    else if (key === "spiritAnimalReport")
      await invoke(
        (await import("@/app/api/spirit-animal-report/submit/route")).POST,
        "/api/spirit-animal-report/submit",
        userId,
        { answers: old.answers },
      );
    else if (key === "witchArchetypeReport")
      await invoke(
        (await import("@/app/api/witch-archetype/route")).POST,
        "/api/witch-archetype",
        userId,
        { answers: old.answers },
      );
  }
  const saved = checked(
    await db()
      .from(spec.table)
      .select("*")
      .eq(spec.key, userId)
      .order(key === "witchArchetypeReport" ? "updated_at" : "created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
  );
  if (!reportReady(key, saved, true))
    throw new SupportError(
      "Recovery has no verified saved result. Do not tell the customer it is ready.",
      409,
    );
  return {
    ready: true,
    report: key,
    recordId: saved.id,
    verifiedAt: new Date().toISOString(),
  };
}
