import React, {
  useEffect
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import setHowItWorksData from 'src/modules/how-it-works/redux/how-it-works-actions';
import fetchData from 'src/modules/how-it-works/redux/fetch-how-it-works-data';
import Title from 'src/modules/title/title';
import SubTitle from 'src/modules/sub-title/sub-title';
import HowItWorksItem from 'src/modules/how-it-works/how-it-works-item/how-it-works-item';

const HowItWorks = (): React.ReactElement => {
  const dispatch = useDispatch();
  const howItWorksData = useSelector((state: any) => state.howItWorks);
  const attr = howItWorksData.data ? howItWorksData.data.attributes ? howItWorksData.data.attributes : {} : {};
  const howItWorksItems = howItWorksData.data && howItWorksData.data.relationships &&
    howItWorksData.data.relationships.items && howItWorksData.data.relationships.items.data ?
    howItWorksData.data.relationships.items.data : [];
  const HideShadowTitle = false;

  useEffect(() => {
    let version = attr.version ? attr.version : 0;
    if ( howItWorksItems.length && !howItWorksItems[0].attributes ) {
      version = 0;
    }
    fetchData( version )
      .then((d: any) => {
        if ( d ) dispatch(setHowItWorksData(d));
      })
      .catch((error) => {
        console.log(error);
      });
  }, [fetchData]);

  return (
    <div className='container row'>
      { attr.title ? <Title text = {attr.title} color='#2196f3' shadow={HideShadowTitle}/> : null }
      { attr.sub_title ? <SubTitle text = {attr.sub_title} /> : null }
      {
        howItWorksItems.map((item: any, index: any ) => {
          return (
            <HowItWorksItem
              key={index}
              number={index}
              attr={item.attributes}
            />
          );
        })
      }
    </div>
  );
};

export default HowItWorks;
