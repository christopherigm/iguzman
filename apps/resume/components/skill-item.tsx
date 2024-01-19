import { ReactElement } from 'react';
import LogoItem from 'components/logo-item';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { UserSkill } from 'classes/user-skill';
import { Signal, signal } from '@preact-signals/safe-react';

type TextProps = {
  text: string;
  divider?: boolean;
};
const Text = ({ text, divider = true }: TextProps): ReactElement => {
  return (
    <Box width="100%" marginBottom={0.5}>
      {divider ? (
        <Box marginBottom={0.5}>
          <Divider />
        </Box>
      ) : null}
      <Typography width="100%" variant="body2" textAlign="center">
        {text}
      </Typography>
    </Box>
  );
};

type SkillItemProps = {
  userSkill: UserSkill;
  darkMode: boolean;
  itemSelected: boolean;
  onClick: () => void;
};

const SkillItem = ({
  userSkill,
  darkMode,
  itemSelected,
  onClick,
}: SkillItemProps): ReactElement => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      border={`solid 1px ${darkMode ? '#333' : '#eee'}`}
      width="calc(50% - 20px)"
      marginTop="10px"
      paddingBottom={0.5}
      onClick={onClick}
      sx={{ cursor: 'pointer', userSelect: 'none' }}
    >
      {userSkill.relationships.skill.data.attributes.img_picture ? (
        <>
          <LogoItem
            image={userSkill.relationships.skill.data.attributes.img_picture}
            width={'100%'}
            height={itemSelected ? 40 : 70}
            resize={false}
            borderRadius={0}
            padding={1}
            darkMode={darkMode}
          />
          <Box width="100%" marginBottom={0.5}>
            <Divider />
          </Box>
        </>
      ) : null}
      {itemSelected ? (
        <>
          <Text
            text={`Years of exp: ${userSkill.attributes.years_of_experience}`}
            divider={false}
          />
          <Text text={`Confidence: ${userSkill.attributes.percentage}%`} />
          <Box width="calc(100% - 20px)" marginTop={0.5} marginBottom={0.5}>
            <Tooltip title="Confidence">
              <LinearProgress
                variant="determinate"
                value={userSkill.attributes.percentage}
              />
            </Tooltip>
          </Box>
        </>
      ) : (
        <>
          <Text
            text={userSkill.relationships.skill.data.attributes.name}
            divider={false}
          />
          <Box width="calc(100% - 20px)" marginTop={0.5} marginBottom={0.5}>
            <Tooltip title="Confidence">
              <LinearProgress
                variant="determinate"
                value={userSkill.attributes.percentage}
              />
            </Tooltip>
          </Box>
        </>
      )}
    </Box>
  );
};

export default SkillItem;
