import Box from '@mui/material/Box';

export const PagePaddingTopHeight = {
  xs: 56,
  sm: 64,
};

const PagePaddingTop = () => (
  <Box height={PagePaddingTopHeight} className="hide-on-print" />
);

export default PagePaddingTop;
