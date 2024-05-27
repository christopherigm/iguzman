import React, { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { GenericImage, GetIconByName } from '@repo/ui';
import Category from 'classes/category';
import { useMediaQuery, useTheme } from '@mui/material';

type Props = {
  selected: boolean;
  onClick: () => void;
  category: Category;
};

const CategoryItem = ({
  selected = false,
  onClick,
  category,
}: Props): ReactElement => {
  const isXSSize: boolean = useMediaQuery(useTheme().breakpoints.only('xs'));
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
        src={category.attributes.img_picture ?? ''}
        alt={category.attributes.name ?? 'picture'}
        xs={120}
        sm={150}
        md={170}
      />
      <Box position="relative" width="100%" height={32}>
        <Box
          position="absolute"
          left={`calc(50% - ${isXSSize ? 28 : 32}px)`}
          top={-32}
          width={64 - (isXSSize ? 8 : 0)}
          height={64 - (isXSSize ? 8 : 0)}
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
              category.attributes.icon !== ''
                ? category.attributes.icon
                : 'AccountTree'
            }
            iconSize={{ xs: 64 - (isXSSize ? 24 : 16) }}
            color={category.attributes.color ?? '#777'}
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
          {category.attributes.name}
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

export default CategoryItem;
