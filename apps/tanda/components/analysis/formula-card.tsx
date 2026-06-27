import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";
import { MathFormula } from "@repo/ui/core-elements/math-formula";

/** A labelled math model: title, description, and a typeset formula block. */
export function FormulaCard({
  label,
  description,
  formula,
}: {
  label: string;
  description: string;
  formula: string;
}) {
  return (
    <Card padding={16} gap={8}>
      <Typography fontWeight={700} color="var(--foreground)">
        {label}
      </Typography>
      <Typography styles={{ lineHeight: 1.6 }} color="var(--muted-foreground)">
        {description}
      </Typography>
      <Box
        padding="10px 14px"
        borderRadius={6}
        backgroundColor="var(--surface-2)"
      >
        <MathFormula formula={formula} displayMode />
      </Box>
    </Card>
  );
}

export default FormulaCard;
