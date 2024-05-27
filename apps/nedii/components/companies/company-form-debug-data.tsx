import { ReactElement } from 'react';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Stand from 'classes/stand';

type Props = {
  darkMode: boolean;
  stand: Stand;
};

const CompanyFormDebugData = ({
  darkMode = false,
  stand,
}: Props): ReactElement => {
  return (
    <>
      <Typography variant="body1">Debug Data</Typography>
      <Grid container marginTop={0} columnSpacing={2} rowSpacing={2}>
        <Grid item xs={4}>
          <Typography variant="body1">
            Owner: {stand.relationships.owner?.data.id}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Expo: {stand.relationships.expo.data.id}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Category: {stand.relationships.category.data.id}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">Name: {stand.attributes.name}</Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Slogan: {stand.attributes.slogan}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Description: {stand.attributes.description}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Short description: {stand.attributes.short_description}
          </Typography>
        </Grid>

        <Grid item xs={4}>
          <Typography variant="body1">
            Restaurant: {stand.attributes.restaurant ? 'Yes' : 'No'}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Booking active: {stand.attributes.booking_active ? 'Yes' : 'No'}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Booking fee: {stand.attributes.booking_fee}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Booking email: {stand.attributes.booking_email}
          </Typography>
        </Grid>

        <Grid item xs={4}>
          <Typography variant="body1">
            City: {stand.relationships.city.data.id}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Address: {stand.attributes.address}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Zipcode: {stand.attributes.zip_code}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Contact email: {stand.attributes.contact_email}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Support email: {stand.attributes.support_email}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            {/* Phone: {stand.relationships.phone.} */}
          </Typography>
        </Grid>

        <Grid item xs={4}>
          <Typography variant="body1">
            Img logo: {stand.attributes.img_logo ? 'yes' : 'no'}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Img cover: {stand.attributes.img_cover ? 'yes' : 'no'}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Images in gallery: {stand.relationships.pictures.data.length}
          </Typography>
        </Grid>

        <Grid item xs={4}>
          <Typography variant="body1">
            Web link: {stand.attributes.web_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Facebook link: {stand.attributes.facebook_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Twitter link: {stand.attributes.twitter_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Instagram link: {stand.attributes.instagram_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Linkedin link: {stand.attributes.linkedin_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Google link: {stand.attributes.google_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Youtube link: {stand.attributes.youtube_link}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            About: {stand.attributes.about}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Mission: {stand.attributes.mission}
          </Typography>
        </Grid>
        <Grid item xs={4}>
          <Typography variant="body1">
            Vision: {stand.attributes.vision}
          </Typography>
        </Grid>
      </Grid>
    </>
  );
};

export default CompanyFormDebugData;
