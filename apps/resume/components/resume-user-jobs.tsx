import Grid from '@mui/material/Grid';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import { ReactElement } from 'react';
import { DateRangeComposer } from '@repo/utils';
import { UserJob } from 'classes/user-job';
import { useMediaQuery, useTheme } from '@mui/material';
import ResumeInfoItem from 'components/resume-detail-item';
import Title from 'components/title';

type Props = {
  userJobs: Array<UserJob>;
  devMode: boolean;
  darkMode: boolean;
};

const ResumeUserJobs = ({
  userJobs,
  devMode,
  darkMode,
}: Props): ReactElement => {
  const theme = useTheme();
  const isXSSize: boolean = useMediaQuery(theme.breakpoints.only('xs'));

  return (
    <Grid container rowSpacing={2} marginTop={isXSSize ? 1 : 'none'}>
      <Grid item xs={12}>
        <Title title="Work experience" darkMode={darkMode}>
          <BusinessCenterIcon fontSize="medium" />
        </Title>
      </Grid>
      {userJobs.map((job: UserJob, index: number) => {
        const title = job.attributes.job_title;
        const countryCode =
          job.relationships?.city?.data?.relationships?.state?.data
            ?.relationships?.country?.data?.attributes?.code ?? null;
        let subTitle =
          job.relationships?.company?.data?.attributes?.name ?? null;
        if (job.relationships?.city?.data?.attributes?.name) {
          subTitle += ', ' + job.relationships?.city?.data?.attributes?.name;
        }
        if (
          job.relationships?.city?.data?.relationships?.state?.data?.attributes
            ?.code
        ) {
          subTitle +=
            ', ' +
            job.relationships?.city?.data?.relationships?.state?.data
              ?.attributes?.code;
        } else if (
          job.relationships?.city?.data?.relationships?.state?.data?.attributes
            ?.name
        ) {
          subTitle +=
            ', ' +
            job.relationships?.city?.data?.relationships?.state?.data
              ?.attributes?.name;
        }
        if (countryCode) {
          subTitle += ',';
        }
        const image =
          job.relationships?.company?.data?.attributes?.img_picture ?? null;
        const dates = DateRangeComposer(
          job.attributes.start_date,
          job.attributes.end_date,
          isXSSize
        );
        const description = job.attributes.description ?? '';
        const link = job.attributes.job_url ?? null;
        return (
          <Grid item xs={12} key={index}>
            <ResumeInfoItem
              title={title}
              subTitle={subTitle}
              image={image}
              dates={dates}
              description={description}
              darkMode={darkMode}
              countryCode={countryCode.toLocaleLowerCase()}
              link={link}
            />
          </Grid>
        );
      })}
    </Grid>
  );
};

export default ResumeUserJobs;
