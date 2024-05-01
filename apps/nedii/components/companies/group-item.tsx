import React, { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { GenericImage, GetIconByName } from '@repo/ui';
import Group from 'classes/group';

type Props = {
  selected: boolean;
  onClick: () => void;
  group: Group;
};

const GroupItem = ({
  selected = false,
  onClick,
  group,
}: Props): ReactElement => {
  return (
    <Box
      border="1px solid #ccc"
      borderRadius={2}
      overflow="hidden"
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        opacity: selected ? 1 : 0.4,
      }}
    >
      <GenericImage
        src={group.attributes.img_picture ?? ''}
        alt={group.attributes.name ?? 'picture'}
        xs={120}
        sm={150}
        md={170}
      />
      <Box position="relative" width="100%" height={32}>
        <Box
          position="absolute"
          left="calc(50% - 32px)"
          top={-32}
          width={64}
          height={64}
          borderRadius={2}
          bgcolor="rgba(255,255,255, 0.8)"
          boxShadow={1}
          padding={1}
          sx={{
            stroke: '#000',
            strokeWidth: 0.2,
          }}
        >
          <GetIconByName
            name={
              group.attributes.icon !== ''
                ? group.attributes.icon
                : 'AccountTree'
            }
            iconSize={{ xs: 64 - 16 }}
            color={group.attributes.color ?? '#777'}
          />
        </Box>
      </Box>
      <Box
        display="flex"
        flexDirection="row"
        justifyContent="center"
        marginTop={0}
        padding={1.5}
      >
        <Typography variant="body1" textAlign="center" noWrap={true}>
          {group.attributes.name}
        </Typography>
        <Box marginTop={0.4} marginLeft={0.5}>
          {selected ? (
            <CheckCircleIcon
              sx={{
                color: 'green',
                fontSize: 18,
              }}
            />
          ) : null}
        </Box>
      </Box>
    </Box>
  );
};

export default GroupItem;
