import Grid from '@mui/material/Grid';
import { ReactElement, useEffect } from 'react';
import { Signal, signal } from '@preact-signals/safe-react';
import {
  Box,
  Typography,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import Title from 'components/title';
import { UserSkill } from 'classes/user-skill';
import { SkillCategory } from 'classes/skill-category';
import LayersIcon from '@mui/icons-material/Layers';
import { PaperCard } from '@repo/ui';
import SkillItem from 'components/skill-item';
import MoreVertIcon from '@mui/icons-material/MoreVert';

type Item = {
  category: SkillCategory;
  items: Array<UserSkill>;
};
const items: Signal<Array<Item>> = signal([]);
const itemSelected: Signal<boolean> = signal(false);

type Props = {
  userSkills: Array<UserSkill>;
  themeColor: string;
  devMode: boolean;
  darkMode: boolean;
};

const ResumeUserSkills = ({
  userSkills,
  themeColor,
  devMode,
  darkMode,
}: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  useEffect(() => {
    const itemsTmp: Array<Item> = [];
    userSkills.map((userSkill: UserSkill) => {
      const category =
        userSkill.relationships.skill.data.relationships.category.data;
      const categoryInArray = itemsTmp.filter(
        (c) => c.category.id === category.id
      ).length
        ? true
        : false;
      if (!categoryInArray) {
        itemsTmp.push({
          category,
          items: [],
        });
      }
      itemsTmp.map((c) => {
        if (c.category.id === category.id) {
          const skillInArray = c.items.filter(
            (s) =>
              s.relationships.skill.data.id ===
              userSkill.relationships.skill.data.id
          ).length
            ? true
            : false;
          if (!skillInArray) {
            c.items.push(userSkill);
          }
        }
      });
    });
    items.value = [...itemsTmp];
  }, []);

  return (
    <Grid
      container
      rowSpacing={2}
      columnSpacing={{
        xs: 0,
        sm: 2,
        md: 3,
      }}
      marginTop={isXSSize ? 1 : 'none'}
    >
      <Grid item xs={12}>
        <Title title="Skills & Technologies" darkMode={darkMode}>
          <LayersIcon fontSize="medium" />
        </Title>
      </Grid>
      {items.value.map((i: Item, index: number) => {
        return (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <PaperCard padding={0} elevation={2} marginTop={0}>
              <Box
                bgcolor={themeColor}
                display="flex"
                paddingLeft={1}
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="body1" color="white" noWrap={true}>
                  {i.category.attributes.name}
                </Typography>
                <IconButton
                  aria-label="show-more"
                  onClick={() => (itemSelected.value = !itemSelected.value)}
                >
                  <MoreVertIcon />
                </IconButton>
              </Box>
              <Box
                display="flex"
                justifyContent="space-evenly"
                flexWrap="wrap"
                paddingBottom="10px"
              >
                {i.items.map((userSkill: UserSkill, index: number) => {
                  return (
                    <SkillItem
                      userSkill={userSkill}
                      darkMode={darkMode}
                      itemSelected={itemSelected.value}
                      onClick={() => (itemSelected.value = !itemSelected.value)}
                      key={index}
                    />
                  );
                })}
              </Box>
            </PaperCard>
          </Grid>
        );
      })}
    </Grid>
  );
};

export default ResumeUserSkills;
