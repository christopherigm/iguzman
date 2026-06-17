import React from "react";
import { Box, type BoxProps } from "./box";
import "./card.css";

export type CardProps = BoxProps;

/**
 * Card - a bordered, flex-column container with sensible defaults.
 * All UIComponentProps are accepted and override the defaults.
 *
 * @example
 * <Card gap={12}>
 *   <Typography variant="body" fontWeight={600}>Title</Typography>
 *   <Typography variant="caption">Detail</Typography>
 * </Card>
 *
 * @example
 * // Override defaults freely
 * <Card gap={8} backgroundColor="var(--surface-1)" className="my-card">
 *   Content
 * </Card>
 */
export const Card: React.FC<CardProps> = ({
  display = "flex",
  flexDirection = "column",
  padding = 14,
  borderRadius = 6,
  border = "1px solid var(--border, #e5e7eb)",
  elevation = 5,
  backgroundColor = "var(--surface-1)",
  ...rest
}) => (
  <Box
    display={display}
    flexDirection={flexDirection}
    padding={padding}
    borderRadius={borderRadius}
    border={border}
    elevation={elevation}
    backgroundColor={backgroundColor}
    {...rest}
  />
);

export default Card;
