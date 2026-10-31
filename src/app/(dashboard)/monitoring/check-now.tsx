"use client";

import { useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { checkSitesNow } from "@/lib/actions/monitor";
import { Button } from "@/components/ui/button";

export function CheckNow() {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await checkSitesNow();
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        })
      }
    >
      <RefreshCwIcon className={pending ? "animate-spin" : ""} /> {pending ? "Checking…" : "Check now"}
    </Button>
  );
}
