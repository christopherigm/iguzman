import { useEffect } from 'react';
import Head from 'next/head';
import Container from '@mui/material/Container';
import User from 'classes/user';
import { MainLayout } from '@repo/ui';
import System, { system } from 'classes/system';
import { Box, Grid } from '@mui/material';
import UserResumeHeader from 'components/user-resume-header';
import UserInfo from 'components/user-info';
import ResumeUserJobs from 'components/resume-user-jobs';
import ResumeUserEducation from 'components/resume-user-education';
import ResumeUserSkills from 'components/resume-user-skills';

const user = User.getInstance();
const pageUser = User.getInstance();

const Page = (props: any) => {
  pageUser.setResumeUserAttributesFromPlainObject(props.user ?? {});

  useEffect(() => {
    system.setResumeSystemAttributesFromPlainObject(props);
    user.getResumeUserFromLocalStorage();
    pageUser.URLBase = props.URLBase;
    pageUser.getUserJobsFromAPI();
    pageUser.getUserSchoolsFromAPI();
    pageUser.getUserSkillsFromAPI();
  }, [props]);

  return (
    <MainLayout
      darkMode={system.darkMode}
      switchTheme={() => system.switchTheme()}
      devMode={system.devMode}
      switchDevMode={() => system.switchDevMode()}
      isLoading={system.isLoading}
      language={props.defaultLanguage}
      user={{
        firstname: user.attributes.first_name,
        lastname: user.attributes.last_name,
        username: user.attributes.username,
        img_picture: user.attributes.img_picture,
      }}
      loginEnabled={props.loginEnabled}
      version={props.version}
      logo="/images/logo.png"
      hostName={props.hostName}
      maxWidth={false}
    >
      <Head>
        <link rel="icon" href="favicon.ico" />
        <meta name="description" content="Video downloader" />
        <title>My Resume</title>
        <meta name="og:title" content="Video downloader" />
        <meta name="twitter:card" content="/images/logo.png" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.0.0/css/flag-icons.min.css"
        />
      </Head>
      {pageUser && pageUser.id ? (
        <>
          <UserResumeHeader
            user={pageUser}
            darkMode={system.darkMode}
            devMode={system.devMode}
          />
          <Container maxWidth="lg">
            <Grid
              container
              columnSpacing={{
                xs: 0,
                sm: 2,
                md: 3,
              }}
              rowSpacing={2}
              marginTop={1}
              marginBottom={3}
            >
              <Grid item xs={12} sm={5} md={4}>
                <UserInfo
                  user={pageUser}
                  darkMode={system.darkMode}
                  devMode={system.devMode}
                />
              </Grid>
              {pageUser.jobs.length ? (
                <Grid item xs={12} sm={7} md={8}>
                  <ResumeUserJobs
                    userJobs={pageUser.jobs}
                    darkMode={system.darkMode}
                    devMode={system.devMode}
                  />
                  {pageUser.schools.length ? (
                    <>
                      <Box marginTop={4}></Box>
                      <ResumeUserEducation
                        userSchools={pageUser.schools}
                        darkMode={system.darkMode}
                        devMode={system.devMode}
                      />
                    </>
                  ) : null}
                </Grid>
              ) : null}
              {pageUser.skills.length ? (
                <>
                  <Box marginTop={4}></Box>
                  <Grid item xs={12}>
                    <ResumeUserSkills
                      userSkills={pageUser.skills}
                      themeColor={pageUser.attributes.theme_color}
                      darkMode={system.darkMode}
                      devMode={system.devMode}
                    />
                  </Grid>
                </>
              ) : null}
            </Grid>
          </Container>
        </>
      ) : null}
    </MainLayout>
  );
};

export async function getServerSideProps({ req, params }: any) {
  const system = System.getInstance();
  system.parseCookies(req.cookies);
  user.URLBase = system.URLBase;
  if (!isNaN(Number(params.id))) {
    user.id = params.id;
  } else if (params.id !== undefined && params.id !== '') {
    user.attributes.username = params.id;
  }
  const data = await user.getUserFromAPI();
  return {
    props: {
      ...system.getResumePlainAttributes(),
      user: data,
    },
  };
}

export default Page;
