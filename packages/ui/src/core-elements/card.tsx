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
 *
 * @example
 * // Frosted-glass card over a background image
 * <Card translucent backgroundColor="rgba(255,255,255,0.6)">Content</Card>
 */
export const Card: React.FC<CardProps> = ({
  display = "flex",
  flexDirection = "column",
  padding = 14,
  borderRadius = 6,
  border = "1px solid var(--border, #e5e7eb)",
  elevation = 5,
  backgroundColor = "var(--surface-1)",
  translucent = false,
  styles,
  ...rest
}) => (
  <Box
    display={display}
    flexDirection={flexDirection}
    padding={padding}
    borderRadius={borderRadius}
    border={border}
    elevation={elevation}
    backgroundColor={translucent ? undefined : backgroundColor}
    translucent={translucent}
    // Clip children to the rounded corners so content can't bleed past the
    // border / blurred backdrop. Callers can override via `styles`.
    styles={{ overflow: "hidden", ...styles }}
    {...rest}
  />
);

export default Card;
