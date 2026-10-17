"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Brand, BrandType, PipelineStage, Region, TeamMember } from "@/db/schema";
import type { BrandFormState } from "@/lib/actions/brands";
import { BRAND_TYPES, BRAND_TYPE_LABELS, BRAND_TYPE_PLACE_LABELS, DESIGN_REFERENCES, DESIGN_REFERENCE_LABELS, NONE_VALUE, PRIORITIES, PRIORITY_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand-logo";
import { CountryCombobox } from "@/components/country-combobox";

type Props = {
  brand?: Brand | null;
  stages: PipelineStage[];
  regions: Region[];
  members: TeamMember[];
  action: (prev: BrandFormState, formData: FormData) => Promise<BrandFormState>;
  cancelHref: string;
};

const NONE = NONE_VALUE;

function Field({ name, label, children, hint, errors }: { name: string; label: string; children: React.ReactNode; hint?: string; errors: Record<string, string> }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !errors[name] && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors[name] && <p className="text-xs text-destructive">{errors[name]}</p>}
    </div>
  );
}
const MAX_LOGO_BYTES = 300 * 1024;

export function BrandForm({ brand, stages, regions, members, action, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const errors = state?.errors ?? {};
  const [countryCode, setCountryCode] = useState(brand?.countryCode ?? "");
  const [brandType, setBrandType] = useState<BrandType>(brand?.brandType ?? "country");
  const [logoData, setLogoData] = useState<string | undefined>(undefined);
  const [logoError, setLogoError] = useState<string | null>(null);
  const defaultStage = brand?.stageId ?? stages.find((s) => s.key === "idea")?.id ?? stages[0]?.id;


  const onLogoFile = (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) return setLogoError("Choose an image file.");
    if (file.size > MAX_LOGO_BYTES) return setLogoError("Keep the logo under 300 KB (a small PNG or SVG is ideal).");
    const reader = new FileReader();
    reader.onload = () => setLogoData(String(reader.result));
    reader.readAsDataURL(file);
  };


  return (
    <form action={formAction} className="space-y-6">
      {state?.message && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.message}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field errors={errors} name="name" label="Brand name">
            <Input id="name" name="name" defaultValue={brand?.name ?? ""} required maxLength={120} placeholder="Nusa & Co." />
          </Field>
          <Field errors={errors} name="brandType" label="Brand type">
            <Select name="brandType" value={brandType} onValueChange={(v) => setBrandType(v as BrandType)}>
              <SelectTrigger id="brandType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRAND_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {BRAND_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {brandType === "country" ? (
            <Field errors={errors} name="countryCode" label="Country">
              <CountryCombobox id="countryCode" value={countryCode} onChange={(code) => setCountryCode(code)} />
              {errors.country && <p className="text-xs text-destructive">{errors.country}</p>}
            </Field>
          ) : (
            <Field errors={errors} name="country" label={BRAND_TYPE_PLACE_LABELS[brandType]}>
              <Input
                id="country"
                name="country"
                required
                maxLength={120}
                defaultValue={brand && brand.brandType === brandType ? brand.country : ""}
                placeholder={brandType === "region" ? "Arab world, East Africa…" : "Golf safaris, Diving…"}
              />
              <input type="hidden" name="countryCode" value="" />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field
              errors={errors}
              name="marketsCovered"
              label="Markets covered"
              hint={
                brandType === "niche"
                  ? "The activity or activities, comma separated or one per line."
                  : brandType === "region"
                    ? "Every country the brand covers, comma separated or one per line. They're coloured on the map."
                    : "Leave empty for just this country, or list more."
              }
            >
              <Textarea id="marketsCovered" name="marketsCovered" rows={2} defaultValue={(brand?.marketsCovered ?? []).join(", ")} />
            </Field>
          </div>
          <Field errors={errors} name="regionId" label="Region">
            <Select name="regionId" defaultValue={brand?.regionId ?? NONE}>
              <SelectTrigger id="regionId">
                <SelectValue placeholder="Pick a region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No region</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field errors={errors} name="stageId" label="Stage">
            <Select name="stageId" defaultValue={defaultStage}>
              <SelectTrigger id="stageId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field errors={errors} name="ownerId" label="Owner">
            <Select name="ownerId" defaultValue={brand?.ownerId ?? NONE}>
              <SelectTrigger id="ownerId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field errors={errors} name="priority" label="Priority">
            <Select name="priority" defaultValue={brand?.priority ?? "medium"}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field errors={errors} name="targetLaunchDate" label="Target launch date">
            <Input id="targetLaunchDate" name="targetLaunchDate" type="date" defaultValue={brand?.targetLaunchDate ?? ""} />
          </Field>
          <div className="space-y-1.5">
            <Label htmlFor="logoFile">Logo</Label>
            <div className="flex items-center gap-3">
              <BrandLogo name={brand?.name ?? "?"} logoUrl={brand?.logoUrl} logoData={logoData ?? brand?.logoData} size={40} />
              <Input id="logoFile" type="file" accept="image/*" onChange={(e) => onLogoFile(e.target.files?.[0])} className="flex-1" />
              {(logoData || brand?.logoData) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogoData("")}>
                  Remove
                </Button>
              )}
            </div>
            {logoData !== undefined && <input type="hidden" name="logoData" value={logoData} />}
            {(logoError || errors.logoData) && <p className="text-xs text-destructive">{logoError ?? errors.logoData}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Design and content references</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field errors={errors} name="designReference" label="Design reference">
            <Select name="designReference" defaultValue={brand?.designReference ?? "atlas"}>
              <SelectTrigger id="designReference">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESIGN_REFERENCES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DESIGN_REFERENCE_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field errors={errors} name="designReferenceUrl" label="Design reference URL">
            <Input id="designReferenceUrl" name="designReferenceUrl" defaultValue={brand?.designReferenceUrl ?? ""} placeholder="https://www.safari.com" />
          </Field>
          <div className="sm:col-span-2">
            <Field errors={errors} name="contentReferenceUrls" label="Content reference URLs" hint="One per line. Add a note after the URL if it helps, e.g. https://… (blog format)">
              <Textarea id="contentReferenceUrls" name="contentReferenceUrls" defaultValue={(brand?.contentReferenceUrls ?? []).join("\n")} rows={3} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field errors={errors} name="brandStory" label="Brand story (short)">
              <Textarea id="brandStory" name="brandStory" defaultValue={brand?.brandStory ?? ""} rows={4} placeholder="Who the brand is for, what makes it different, the tone." />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field errors={errors} name="paletteNotes" label="Palette notes">
              <Textarea id="paletteNotes" name="paletteNotes" defaultValue={brand?.paletteNotes ?? ""} rows={2} placeholder="Deep teal + sand, warm off-white backgrounds…" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field errors={errors} name="repoUrl" label="GitHub repo">
            <Input id="repoUrl" name="repoUrl" defaultValue={brand?.repoUrl ?? ""} placeholder="https://github.com/org/repo" />
          </Field>
          <Field errors={errors} name="vercelProjectUrl" label="Vercel project">
            <Input id="vercelProjectUrl" name="vercelProjectUrl" defaultValue={brand?.vercelProjectUrl ?? ""} placeholder="https://vercel.com/team/project" />
          </Field>
          <Field errors={errors} name="stagingUrl" label="Staging URL">
            <Input id="stagingUrl" name="stagingUrl" defaultValue={brand?.stagingUrl ?? ""} placeholder="https://project.vercel.app" />
          </Field>
          <Field errors={errors} name="productionDomain" label="Production domain">
            <Input id="productionDomain" name="productionDomain" defaultValue={brand?.productionDomain ?? ""} placeholder="www.brand.com" />
          </Field>
          <Field errors={errors} name="logoUrl" label="Logo URL (alternative to upload)">
            <Input id="logoUrl" name="logoUrl" defaultValue={brand?.logoUrl ?? ""} placeholder="https://www.brand.com/logo.svg" />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : brand ? "Save changes" : "Create brand"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
