import { Badge } from "./ui/badge";
import type { CheckStatus } from "../types/api";

export function StatusBadge({ status }: { status?: CheckStatus | null }) {
  if (status === "present") return <Badge className="font-mono" variant="present">Present</Badge>;
  if (status === "absent") return <Badge className="font-mono" variant="absent">Absent</Badge>;
  if (status === "error") return <Badge className="font-mono" variant="error">Error</Badge>;
  return <Badge className="font-mono" variant="absent">Unchecked</Badge>;
}
