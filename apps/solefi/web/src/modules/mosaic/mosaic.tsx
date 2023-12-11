import React, {
  useEffect
} from 'react';
import {
  useSelector,
  useDispatch
} from 'react-redux';
import setMosaicData from 'src/modules/mosaic/redux/mosaic-actions';
import fetchData from 'src/modules/mosaic/redux/fetch-mosaic-data';
import Title from 'src/modules/title/title';
import SubTitle from 'src/modules/sub-title/sub-title';
import MosaicItem from 'src/modules/mosaic/mosaic-item';
import innerSort from 'src/modules/utils/inner-sort';

const Mosaic = ():React.ReactElement => {
  const dispatch = useDispatch();
  const mosaicData = useSelector((state: any) => state.mosaicData);
  const attr = mosaicData.data ? mosaicData.data.attributes ? mosaicData.data.attributes : {} : {};
  const mosaicItems = mosaicData.data && mosaicData.data.relationships &&
    mosaicData.data.relationships.items && mosaicData.data.relationships.items.data ?
    mosaicData.data.relationships.items.data : [];
  mosaicItems ? mosaicItems.sort(innerSort('order')) : null;

  useEffect(() => {
    let version = attr.version ? attr.version : 0;
    if ( mosaicItems.length && !mosaicItems[0].attributes ) {
      version = 0;
    }
    fetchData( version )
      .then((d: any) => {
        if ( d ) dispatch(setMosaicData(d));
      })
      .catch((error) => {
        console.log(error);
      });
  }, [fetchData]);

  return (
    <>
      <div className='container row'>
        { attr.title ? <Title text={attr.title} color='#2196f3' shadow={false} /> : null }
        { attr.sub_title ? <SubTitle text={attr.sub_title} /> : null }
      </div>
      {
        mosaicItems.map((i: any, index: number) => {
          return (
            <MosaicItem
              key={index}
              item={i.attributes} />
          );
        })
      }
    </>
  );
};

export default Mosaic;
