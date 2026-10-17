import { redirect } from "next/navigation";

// The old name picker: everyone now picks themselves on the sign-in page.
export default function WhoAmIPage() {
  redirect("/login");
}
