import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Pagination from '@mui/material/Pagination';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import AudioIcon from '@mui/icons-material/Audiotrack';
import YouTube from '@mui/icons-material/YouTube';
import Instagram from '@mui/icons-material/Instagram';
import School from '@mui/icons-material/School';
import Facebook from '@mui/icons-material/Facebook';
import X from '@mui/icons-material/X';
import BlockIcon from '@mui/icons-material/Block';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GridViewIcon from '@mui/icons-material/GridView';
import LinkedIn from '@mui/icons-material/LinkedIn';
import GitHub from '@mui/icons-material/GitHub';
import Email from '@mui/icons-material/Email';
import Phone from '@mui/icons-material/Phone';
import LinearProgress from '@mui/material/LinearProgress';
import { Signal, signal } from '@preact-signals/safe-react';
import { PaperCard } from '@repo/ui';
import { ReactElement } from 'react';
import { DateRangeComposer } from '@repo/utils';
import { UserSchool } from 'classes/user-school';
import { useMediaQuery, useTheme } from '@mui/material';
import ResumeInfoItem from 'components/resume-info-item';
import Title from 'components/title';

type Props = {
  userSchools: Array<UserSchool>;
  devMode: boolean;
  darkMode: boolean;
};

const ResumeUserEducation = ({
  userSchools,
  devMode,
  darkMode,
}: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  return (
    <Grid container rowSpacing={2} marginTop={isXSSize ? 1 : 'none'}>
      <Grid item xs={12}>
        <Title title="Education" darkMode={darkMode}>
          <School fontSize="medium" />
        </Title>
      </Grid>
      {userSchools.map((school: UserSchool, index: number) => {
        const title = school.attributes.field_of_study;
        const countryCode =
          school.relationships?.city?.data?.relationships?.state?.data
            ?.relationships?.country?.data?.attributes?.code ?? null;
        let subTitle =
          school.relationships?.school?.data?.attributes?.name ?? null;
        if (school.relationships?.city?.data?.attributes?.name) {
          subTitle += ', ' + school.relationships?.city?.data?.attributes?.name;
        }
        if (
          school.relationships?.city?.data?.relationships?.state?.data
            ?.attributes?.code
        ) {
          subTitle +=
            ', ' +
            school.relationships?.city?.data?.relationships?.state?.data
              ?.attributes?.code;
        } else if (
          school.relationships?.city?.data?.relationships?.state?.data
            ?.attributes?.name
        ) {
          subTitle +=
            ', ' +
            school.relationships?.city?.data?.relationships?.state?.data
              ?.attributes?.name;
        }
        if (countryCode) {
          subTitle += ',';
        }
        const image =
          school.relationships?.school?.data?.attributes?.img_picture ?? null;
        const dates = DateRangeComposer(
          school.attributes.start_date,
          school.attributes.end_date,
          isXSSize
        );
        const description = school.attributes.degree
          ? `Degree: ${school.attributes.degree}`
          : '';
        const link = school.attributes.school_url ?? null;
        return (
          <Grid item xs={12} key={index}>
            <ResumeInfoItem
              title={title}
              subTitle={subTitle}
              image={image}
              dates={dates}
              description={description}
              darkMode={darkMode}
              link={link}
              countryCode={countryCode.toLocaleLowerCase()}
            />
          </Grid>
        );
      })}
    </Grid>
  );
};

export default ResumeUserEducation;
