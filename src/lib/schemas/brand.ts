import { z } from "zod";
import { DESIGN_REFERENCES, NONE_VALUE, PRIORITIES } from "@/lib/constants";

/** Optional foreign key from a <select>: "", NONE_VALUE or missing all mean null. */
const optionalId = z.preprocess((v) => (v === NONE_VALUE || v === "" || v === undefined ? null : v), z.string().uuid().nullable());

const optionalText = z
  .string()
  .trim()
  .max(5000)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .refine((v) => !v || /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(v), "Enter a web address like https://example.com");

export const brandFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  country: z.string().trim().min(1, "Country is required.").max(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Pick a country from the list.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  regionId: optionalId,
  stageId: z.string().uuid("Pick a stage."),
  designReference: z.enum(DESIGN_REFERENCES).default("atlas"),
  designReferenceUrl: optionalUrl,
  /** One URL per line in the form. */
  contentReferenceUrls: z
    .string()
    .optional()
    .default("")
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50),
    ),
  brandStory: optionalText,
  paletteNotes: optionalText,
  ownerId: optionalId,
  priority: z.enum(PRIORITIES).default("medium"),
  targetLaunchDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  repoUrl: optionalUrl,
  vercelProjectUrl: optionalUrl,
  stagingUrl: optionalUrl,
  productionDomain: optionalUrl,
  logoUrl: optionalUrl,
  /** data: URL produced by the upload control, or "" to clear, or undefined to keep. */
  logoData: z
    .string()
    .max(400_000, "Logo must be under 300 KB.")
    .refine((v) => v === "" || v.startsWith("data:image/"), "Logo must be an image.")
    .optional(),
});

export type BrandFormInput = z.input<typeof brandFormSchema>;
export type BrandFormValues = z.output<typeof brandFormSchema>;

/** Flatten Zod issues into { fieldName: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
