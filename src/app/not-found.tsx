import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That page or brand doesn&apos;t exist.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to overview</Link>
      </Button>
    </main>
  );
}
