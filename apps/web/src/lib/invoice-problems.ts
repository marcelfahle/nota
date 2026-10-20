import { PROBLEMS, type ProblemKey, TAX_TREATMENT_CONFLICT_SUFFIX } from "@/lib/invoice-compliance";
import { TAX_TREATMENT_LABELS, TAX_TREATMENTS, type TaxTreatment } from "@/lib/tax-treatment";

type Translate = (key: ProblemKey, values?: { treatment: string }) => string;

const KEY_BY_SENTENCE = new Map<string, ProblemKey>(
  (Object.keys(PROBLEMS) as Array<keyof typeof PROBLEMS>).map((key) => [PROBLEMS[key], key]),
);

/**
 * The API, CLI and MCP get the English sentence. The web app shows the same
 * problem in the member's language. An unknown sentence is shown as it came,
 * so a new rule never disappears, it just arrives in English first.
 */
export function translateProblem(
  problem: string,
  t: Translate,
  treatmentLabel: (treatment: TaxTreatment) => string,
) {
  const key = KEY_BY_SENTENCE.get(problem);
  if (key) {
    return t(key);
  }
  if (problem.endsWith(TAX_TREATMENT_CONFLICT_SUFFIX)) {
    const label = problem.slice(0, -TAX_TREATMENT_CONFLICT_SUFFIX.length);
    const treatment = TAX_TREATMENTS.find((candidate) => TAX_TREATMENT_LABELS[candidate] === label);
    if (treatment) {
      return t("taxTreatmentConflict", { treatment: treatmentLabel(treatment) });
    }
  }
  return problem;
}
