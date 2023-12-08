import React from 'react';
import { useSelector } from 'react-redux';
import { PlatformTrialContent } from 'src/modules/platform-trial/platform-trial-info';
import PlatformImage from 'src/modules/platform-trial/platform-trial-image';
import 'src/modules/platform-trial/platform-trial.scss';

const PlatformTrial = (): React.ReactElement => {
  const pageData = useSelector((state: any) => state.page);
  const pageAttr: any = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};

  return (
  <div className='PlatformTrial'>
    <PlatformImage image={pageAttr.img_platform} />
    <div className='hide-on-large-only PlatformTrial__background--mini white-text'>
      <PlatformTrialContent />
    </div>
    <div className='hide-on-med-and-down PlatformTrial__background--desktop'></div>
    <div className='hide-on-med-and-down white-text valign-wrapper PlatformTrial__desktop-info'>
      <PlatformTrialContent />
    </div>
  </div>
  );
};

export default PlatformTrial;
