import React from 'react';
import { useSelector } from 'react-redux';
import Title from 'src/modules/title/title';

export const PlatformTrialContent = (): React.ReactElement => {
  const pageData = useSelector((state: any) => state.page);
  const pageAttr: any = pageData.data ? pageData.data.attributes ? pageData.data.attributes : {} : {};

  return (
    <div className='container PlatformTrial__info'>
      <Title
        text={pageAttr.platform_title}
        color='white'
        fullWidth={true}
        align='left'
        shadow={true}/>
      <div
        className='PlatformTrial__text'
        dangerouslySetInnerHTML={{__html: pageAttr.platform_description}}
        ></div>
      <a
        href= {pageAttr.platform_promo_link}
        target='_blank'
        rel='noreferrer'
        className='waves-effect waves-light btn white blue-text PlatformTrial__button'
      >14 DÍAS GRATIS</a>
    </div>
  );
};
