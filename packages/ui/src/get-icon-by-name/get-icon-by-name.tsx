import { ReactElement } from 'react';
import AbcIcon from '@mui/icons-material/Abc';
import AcUnitIcon from '@mui/icons-material/AcUnit';
import AccessAlarmIcon from '@mui/icons-material/AccessAlarm';
import AccessAlarmsIcon from '@mui/icons-material/AccessAlarms';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import AccessibilityIcon from '@mui/icons-material/Accessibility';
import AccessibilityNewIcon from '@mui/icons-material/AccessibilityNew';
import AccessibleIcon from '@mui/icons-material/Accessible';
import AccessibleForwardIcon from '@mui/icons-material/AccessibleForward';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AccountBoxIcon from '@mui/icons-material/AccountBox';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AdUnitsIcon from '@mui/icons-material/AdUnits';
import AdbIcon from '@mui/icons-material/Adb';
import AddIcon from '@mui/icons-material/Add';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import AddAlarmIcon from '@mui/icons-material/AddAlarm';
import AddAlertIcon from '@mui/icons-material/AddAlert';
import AddBoxIcon from '@mui/icons-material/AddBox';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import AddCardIcon from '@mui/icons-material/AddCard';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AddCommentIcon from '@mui/icons-material/AddComment';
import AddHomeIcon from '@mui/icons-material/AddHome';
import AddHomeWorkIcon from '@mui/icons-material/AddHomeWork';
import AddIcCallIcon from '@mui/icons-material/AddIcCall';
import AddLinkIcon from '@mui/icons-material/AddLink';
import AddLocationIcon from '@mui/icons-material/AddLocation';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import AddModeratorIcon from '@mui/icons-material/AddModerator';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import AddRoadIcon from '@mui/icons-material/AddRoad';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import AddTaskIcon from '@mui/icons-material/AddTask';
import AddToDriveIcon from '@mui/icons-material/AddToDrive';
import AddToHomeScreenIcon from '@mui/icons-material/AddToHomeScreen';
import AddToPhotosIcon from '@mui/icons-material/AddToPhotos';
import AddToQueueIcon from '@mui/icons-material/AddToQueue';
import AddchartIcon from '@mui/icons-material/Addchart';
import AdfScannerIcon from '@mui/icons-material/AdfScanner';
import AdjustIcon from '@mui/icons-material/Adjust';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
// import AdsClickIcon from '@mui/icons-material/AdsClick';
import AgricultureIcon from '@mui/icons-material/Agriculture';
import AirIcon from '@mui/icons-material/Air';
import AirlineSeatFlatIcon from '@mui/icons-material/AirlineSeatFlat';
import AirlineSeatFlatAngledIcon from '@mui/icons-material/AirlineSeatFlatAngled';
import AirlineSeatIndividualSuiteIcon from '@mui/icons-material/AirlineSeatIndividualSuite';
import AirlineSeatLegroomExtraIcon from '@mui/icons-material/AirlineSeatLegroomExtra';
import AirlineSeatLegroomNormalIcon from '@mui/icons-material/AirlineSeatLegroomNormal';
import AirlineSeatLegroomReducedIcon from '@mui/icons-material/AirlineSeatLegroomReduced';
import AirlineSeatReclineExtraIcon from '@mui/icons-material/AirlineSeatReclineExtra';
import AirlineSeatReclineNormalIcon from '@mui/icons-material/AirlineSeatReclineNormal';
import AirlineStopsIcon from '@mui/icons-material/AirlineStops';
import AirlinesIcon from '@mui/icons-material/Airlines';
import AirplaneTicketIcon from '@mui/icons-material/AirplaneTicket';
import AirplanemodeActiveIcon from '@mui/icons-material/AirplanemodeActive';
import AirplanemodeInactiveIcon from '@mui/icons-material/AirplanemodeInactive';
import AirplayIcon from '@mui/icons-material/Airplay';
import AirportShuttleIcon from '@mui/icons-material/AirportShuttle';
import AlarmIcon from '@mui/icons-material/Alarm';
import AlarmAddIcon from '@mui/icons-material/AlarmAdd';
import AlarmOffIcon from '@mui/icons-material/AlarmOff';

import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';

type IconSize = {
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
};

type GetIconProps = {
  name: string;
  iconSize?: IconSize;
  color?: string;
};

const GetIconByName = ({
  name,
  iconSize = { xs: 24 },
  color = '#000',
}: GetIconProps): ReactElement => {
  if (name === 'Abc') return <AbcIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AcUnit')
    return <AcUnitIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccessAlarm')
    return <AccessAlarmIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccessAlarms')
    return <AccessAlarmsIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccessTime')
    return <AccessTimeIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccessTimeFilled')
    return <AccessTimeFilledIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Accessibility')
    return <AccessibilityIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccessibilityNew')
    return <AccessibilityNewIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Accessible')
    return <AccessibleIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccessibleForward')
    return <AccessibleForwardIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccountBalance')
    return <AccountBalanceIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccountBalanceWallet')
    return <AccountBalanceWalletIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccountBox')
    return <AccountBoxIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccountCircle')
    return <AccountCircleIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AccountTree')
    return <AccountTreeIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AdUnits')
    return <AdUnitsIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Adb')
    return <AdbIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Add')
    return <AddIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddAPhoto')
    return <AddAPhotoIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddAlarm')
    return <AddAlarmIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddAlert')
    return <AddAlertIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddBox')
    return <AddBoxIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddBusiness')
    return <AddBusinessIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddCard')
    return <AddCardIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddCircle')
    return <AddCircleIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddCircleOutline')
    return <AddCircleOutlineIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddComment')
    return <AddCommentIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddHome')
    return <AddHomeIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddHomeWork')
    return <AddHomeWorkIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddIcCall')
    return <AddIcCallIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddLink')
    return <AddLinkIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddLocation')
    return <AddLocationIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddLocationAlt')
    return <AddLocationAltIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddModerator')
    return <AddModeratorIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddPhotoAlternate')
    return <AddPhotoAlternateIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddReaction')
    return <AddReactionIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddRoad')
    return <AddRoadIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddShoppingCart')
    return <AddShoppingCartIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddTask')
    return <AddTaskIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddToDrive')
    return <AddToDriveIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddToHomeScreen')
    return <AddToHomeScreenIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddToPhotos')
    return <AddToPhotosIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AddToQueue')
    return <AddToQueueIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Addchart')
    return <AddchartIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AdfScanner')
    return <AdfScannerIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Adjust')
    return <AdjustIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AdminPanelSettings')
    return <AdminPanelSettingsIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Agriculture')
    return <AgricultureIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Air')
    return <AirIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatFlat')
    return <AirlineSeatFlatIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatFlatAngled')
    return <AirlineSeatFlatAngledIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatIndividualSuite')
    return (
      <AirlineSeatIndividualSuiteIcon sx={{ color, fontSize: iconSize }} />
    );
  else if (name === 'AirlineSeatLegroomExtra')
    return <AirlineSeatLegroomExtraIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatLegroomNormal')
    return <AirlineSeatLegroomNormalIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatLegroomReduced')
    return <AirlineSeatLegroomReducedIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatReclineExtra')
    return <AirlineSeatReclineExtraIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineSeatReclineNormal')
    return <AirlineSeatReclineNormalIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirlineStops')
    return <AirlineStopsIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Airlines')
    return <AirlinesIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirplaneTicket')
    return <AirplaneTicketIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirplanemodeActive')
    return <AirplanemodeActiveIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirplanemodeInactive')
    return <AirplanemodeInactiveIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Airplay')
    return <AirplayIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AirportShuttle')
    return <AirportShuttleIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'Alarm')
    return <AlarmIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AlarmAdd')
    return <AlarmAddIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'AlarmOff')
    return <AlarmOffIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'aaaaaaaa')
    return <AbcIcon sx={{ color, fontSize: iconSize }} />;
  else if (name === 'ZoomOutMap')
    return <ZoomOutMapIcon sx={{ color, fontSize: iconSize }} />;
  return <></>;
};

export default GetIconByName;
