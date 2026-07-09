"use client";

import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  PASSWORD_MIN_LENGTH,
  checkPassword,
  type PasswordRuleId,
  type PasswordUserAttributes,
} from "@/lib/password-policy";
import "./password-requirements.css";

const RULE_LABEL: Record<PasswordRuleId, string> = {
  minLength: "ruleMinLength",
  notNumeric: "ruleNotNumeric",
  notSimilar: "ruleNotSimilar",
};

interface Props {
  password: string;
  /** Compared against the password by the `notSimilar` rule. */
  attributes?: PasswordUserAttributes;
}

/**
 * Live checklist of the browser-checkable half of the Django password policy.
 * Renders nothing until the user types, so an untouched form is not greeted by
 * a wall of unmet rules. The common-password rule cannot run here and instead
 * surfaces as a server error on submit.
 */
export function PasswordRequirements({ password, attributes }: Props) {
  const t = useTranslations("PasswordPolicy");
  if (!password) return null;

  const rules = checkPassword(password, attributes);

  return (
    <Box
      role="list"
      flexDirection="column"
      gap={2}
      aria-live="polite"
      className="password-requirements"
    >
      {rules.map((rule) => (
        <Typography
          key={rule.id}
          as="div"
          role="listitem"
          variant="caption"
          display="flex"
          alignItems="center"
          gap={6}
          color={
            rule.satisfied
              ? "var(--success, #22c55e)"
              : "var(--muted-foreground, #6b7280)"
          }
          className={`password-requirements__item password-requirements__item--${
            rule.satisfied ? "met" : "unmet"
          }`}
        >
          {t(RULE_LABEL[rule.id], { count: PASSWORD_MIN_LENGTH })}
        </Typography>
      ))}
    </Box>
  );
}
