import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Card } from "@repo/ui/core-elements/card";

/** A phase banner that groups the task tables under a task-breakdown phase. */
export function PhaseHeader({
  phase,
  label,
  prefix,
}: {
  phase: string;
  label: string;
  prefix: string;
}) {
  return (
    <Box
      padding="8px 14px"
      borderRadius={6}
      backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 12%, transparent)"
    >
      <Typography fontWeight={700} color="var(--foreground)">
        {prefix} {phase}: {label}
      </Typography>
    </Box>
  );
}

/** A striped table of id / component / directive rows (user stories & tasks). */
export function TaskTable({
  tasks,
}: {
  tasks: { id: string; component: string; directive: string }[];
}) {
  return (
    <Card
      display="flex"
      flexDirection="column"
      gap={0}
      padding={0}
      styles={{ overflow: "hidden" }}
    >
      {tasks.map((task, idx) => (
        <Box
          key={task.id}
          display="flex"
          flexDirection="column"
          gap={8}
          padding="14px 16px"
          backgroundColor={
            idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)"
          }
          styles={{
            borderBottom:
              idx < tasks.length - 1
                ? "1px solid var(--border, #e5e7eb)"
                : undefined,
          }}
        >
          <Box
            display="flex"
            flexDirection="row"
            alignItems="center"
            gap={10}
            styles={{ flexWrap: "wrap" }}
          >
            <Typography
              fontWeight={700}
              padding="2px 8px"
              borderRadius={4}
              backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 14%, transparent)"
              styles={{ fontFamily: "monospace", flexShrink: 0 }}
              color="var(--accent, #06b6d4)"
            >
              {task.id}
            </Typography>
            <Typography
              fontWeight={600}
              color="var(--foreground)"
              styles={{ minWidth: 0, overflowWrap: "anywhere" }}
            >
              {task.component}
            </Typography>
          </Box>
          <Typography
            styles={{ lineHeight: 1.6, overflowWrap: "anywhere" }}
            color="var(--muted-foreground)"
          >
            {task.directive}
          </Typography>
        </Box>
      ))}
    </Card>
  );
}

export default TaskTable;
